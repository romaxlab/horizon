import type { GeoPoint, Mission, MissionType } from '@horizon/domain'
import type { SegmentOption } from '@horizon/ui'
import { useMutation } from '@tanstack/vue-query'
import { computed, inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import { MissionPlanningError, missionPlannerSlot, type MissionPlanRequest } from './mission.types'

export type BuilderStep = 'details' | 'area' | 'review'

export const ALTITUDE_RANGE = { min: 30, max: 400 } as const
const DEFAULT_ALTITUDE = 120
const DEFAULT_UAV_COUNT = 6
export const LAPS_RANGE = { min: 1, max: 10 } as const
const DEFAULT_LAPS = 3
export const RADIUS_RANGE = { min: 30, max: 1000 } as const
const DEFAULT_RADIUS = 150

/**
 * Per type: label, default mission name and what the operator draws on the map — an area, a
 * closed loop, or one target point to orbit. `lapsLabel` names the repeat count, if any.
 */
export const MISSION_TYPES: Record<
  MissionType,
  {
    label: string
    defaultName: string
    shape: 'area' | 'loop' | 'orbit'
    lapsLabel: string | null
  }
> = {
  area_scan: { label: 'Area Scan', defaultName: 'Area Scan', shape: 'area', lapsLabel: null },
  patrol: { label: 'Patrol', defaultName: 'Patrol', shape: 'loop', lapsLabel: 'Laps' },
  point_inspection: {
    label: 'Inspection',
    defaultName: 'Point Inspection',
    shape: 'orbit',
    lapsLabel: 'Orbits',
  },
}
const typeOptions: SegmentOption<MissionType>[] = (Object.keys(MISSION_TYPES) as MissionType[]).map(
  (value) => ({ value, label: MISSION_TYPES[value].label }),
)

/**
 * New mission flow: details (type, …) → draw the area or patrol loop on the map → generate plan →
 * review → launch.
 * Draft state is transient UI state; planning and launch go through the MissionPlanner contract.
 */
export function useMissionBuilder({ availableUavs }: { availableUavs: Readonly<Ref<number>> }) {
  const missionPlanner = missionPlannerSlot.use()

  const open = ref(false)
  const step = ref<BuilderStep>('details')
  const type = ref<MissionType>('area_scan')
  const name = ref(MISSION_TYPES.area_scan.defaultName)
  const laps = ref(DEFAULT_LAPS)
  const radius = ref(DEFAULT_RADIUS)
  const altitude = ref(DEFAULT_ALTITUDE)
  const uavCount = ref(DEFAULT_UAV_COUNT)
  const area = ref<GeoPoint[]>([])
  const plan = ref<Mission | null>(null)

  const planMutation = useMutation({
    mutationFn: (request: MissionPlanRequest) => missionPlanner.plan(request),
    onSuccess: (mission) => {
      plan.value = mission
      step.value = 'review'
    },
  })
  const launchMutation = useMutation({
    mutationFn: (missionId: string) => missionPlanner.launch(missionId),
    onSuccess: () => {
      close()
    },
  })

  const detailErrors = computed(() => {
    const errors: string[] = []
    if (!name.value.trim()) errors.push('Enter a mission name')
    if (!(altitude.value >= ALTITUDE_RANGE.min && altitude.value <= ALTITUDE_RANGE.max)) {
      errors.push(`Altitude must be ${ALTITUDE_RANGE.min}–${ALTITUDE_RANGE.max} m`)
    }
    if (!(Number.isInteger(uavCount.value) && uavCount.value >= 1))
      errors.push('Use at least 1 UAV')
    else if (uavCount.value > availableUavs.value) {
      errors.push(`Only ${availableUavs.value} standby UAVs available`)
    }
    const lapsLabel = MISSION_TYPES[type.value].lapsLabel
    if (
      lapsLabel &&
      !(
        Number.isInteger(laps.value) &&
        laps.value >= LAPS_RANGE.min &&
        laps.value <= LAPS_RANGE.max
      )
    ) {
      errors.push(`${lapsLabel} must be ${LAPS_RANGE.min}–${LAPS_RANGE.max}`)
    }
    if (
      type.value === 'point_inspection' &&
      !(radius.value >= RADIUS_RANGE.min && radius.value <= RADIUS_RANGE.max)
    ) {
      errors.push(`Radius must be ${RADIUS_RANGE.min}–${RADIUS_RANGE.max} m`)
    }
    return errors
  })
  const shape = computed(() => MISSION_TYPES[type.value].shape)
  // An orbit needs its one target point; an area or loop at least three corners.
  const areaReady = computed(() =>
    shape.value === 'orbit' ? area.value.length === 1 : area.value.length >= 3,
  )

  const error = computed(() => {
    const failure = planMutation.error.value ?? launchMutation.error.value
    return failure ? failure.message : null
  })
  /** No-fly zones that blocked the last plan; the map highlights them. */
  const conflictGeofenceIds = computed(() => {
    const failure = planMutation.error.value
    return failure instanceof MissionPlanningError ? failure.geofenceIds : []
  })
  const busy = computed(() => planMutation.isPending.value || launchMutation.isPending.value)

  function reset() {
    step.value = 'details'
    type.value = 'area_scan'
    name.value = MISSION_TYPES.area_scan.defaultName
    laps.value = DEFAULT_LAPS
    radius.value = DEFAULT_RADIUS
    altitude.value = DEFAULT_ALTITUDE
    uavCount.value = Math.min(DEFAULT_UAV_COUNT, Math.max(availableUavs.value, 1))
    area.value = []
    plan.value = null
    planMutation.reset()
    launchMutation.reset()
  }

  /** Switches the type; an untouched default name follows it. */
  function setType(next: MissionType) {
    if (name.value.trim() === MISSION_TYPES[type.value].defaultName) {
      name.value = MISSION_TYPES[next].defaultName
    }
    // What was drawn doesn't carry over between an area/loop and a target point.
    if ((MISSION_TYPES[next].shape === 'orbit') !== (shape.value === 'orbit')) area.value = []
    type.value = next
  }

  function start() {
    reset()
    open.value = true
  }

  function close() {
    open.value = false
  }

  function addPoint(point: GeoPoint) {
    if (step.value !== 'area') return
    // An inspection has one target: clicking again moves it.
    area.value = shape.value === 'orbit' ? [point] : [...area.value, point]
  }

  function undoPoint() {
    area.value = area.value.slice(0, -1)
  }

  function clearArea() {
    area.value = []
  }

  function next() {
    if (step.value === 'details' && detailErrors.value.length === 0) step.value = 'area'
  }

  function back() {
    planMutation.reset()
    launchMutation.reset()
    if (step.value === 'review') {
      plan.value = null
      step.value = 'area'
    } else if (step.value === 'area') step.value = 'details'
  }

  function generate() {
    if (!areaReady.value || detailErrors.value.length > 0) return
    planMutation.mutate({
      name: name.value.trim(),
      type: type.value,
      area: { polygon: area.value },
      altitude: altitude.value,
      uavCount: uavCount.value,
      laps: laps.value,
      radiusMeters: radius.value,
    })
  }

  function launch() {
    if (plan.value) launchMutation.mutate(plan.value.id)
  }

  const summary = computed(() => {
    const mission = plan.value
    if (!mission) return null
    return {
      uavCount: mission.routes.length,
      waypoints: mission.routes.reduce((sum, r) => sum + r.waypoints.length, 0),
      distanceKm: mission.routes.reduce((sum, r) => sum + r.distanceMeters, 0) / 1000,
      durationSec: Math.max(0, ...mission.routes.map((r) => r.estimatedDurationSec)),
      routes: mission.routes.map((r) => ({
        uavId: r.uavId,
        waypoints: r.waypoints.length,
        distanceKm: r.distanceMeters / 1000,
      })),
    }
  })

  /** Map geometry for the draft / reviewed plan; null when the builder is closed. */
  const overlay = computed(() => {
    if (!open.value) return null
    const target = shape.value === 'orbit' ? area.value[0] : undefined
    const base = {
      shape: shape.value,
      orbit: target ? { target, radiusMeters: radius.value } : null,
    }
    // A planned inspection shows the orbit the backend generated; areas and loops as drawn.
    return plan.value
      ? {
          ...base,
          phase: 'planned' as const,
          area: base.orbit ? plan.value.area.polygon : area.value,
          routes: plan.value.routes,
        }
      : { ...base, phase: 'draft' as const, area: area.value, routes: [] }
  })

  return {
    open,
    step,
    type,
    typeOptions,
    setType,
    shape,
    lapsLabel: computed(() => MISSION_TYPES[type.value].lapsLabel),
    name,
    laps,
    radius,
    altitude,
    uavCount,
    area,
    availableUavs,
    detailErrors,
    areaReady,
    error,
    conflictGeofenceIds,
    busy,
    summary,
    overlay,
    drawing: computed(() => open.value && step.value === 'area'),
    start,
    close,
    addPoint,
    undoPoint,
    clearArea,
    next,
    back,
    generate,
    launch,
  }
}

export type MissionBuilder = ReturnType<typeof useMissionBuilder>

const missionBuilderKey: InjectionKey<MissionBuilder> = Symbol('MissionBuilder')

/** Shares one builder between the route-level composition (map overlay) and the panel. */
export function provideMissionBuilder(builder: MissionBuilder) {
  provide(missionBuilderKey, builder)
}

export function injectMissionBuilder(): MissionBuilder {
  const builder = inject(missionBuilderKey)
  if (!builder) throw new Error('MissionBuilder is not provided')
  return builder
}

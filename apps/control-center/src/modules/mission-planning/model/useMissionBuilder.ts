import type { GeoPoint, Mission } from '@horizon/domain'
import { useMutation } from '@tanstack/vue-query'
import { computed, inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import { useAppServices } from '@/app/providers/services'
import { MissionPlanningError, type MissionPlanRequest } from './mission.types'

export type BuilderStep = 'details' | 'area' | 'review'

export const ALTITUDE_RANGE = { min: 30, max: 400 } as const
const DEFAULT_ALTITUDE = 120
const DEFAULT_UAV_COUNT = 6

/**
 * New Area Scan flow: details → draw area on the map → generate plan → review → launch.
 * Draft state is transient UI state; planning and launch go through the MissionPlanner contract.
 */
export function useMissionBuilder({ availableUavs }: { availableUavs: Readonly<Ref<number>> }) {
  const { missionPlanner } = useAppServices()

  const open = ref(false)
  const step = ref<BuilderStep>('details')
  const name = ref('Area Scan')
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
    return errors
  })
  const areaReady = computed(() => area.value.length >= 3)

  const error = computed(() => {
    const failure = planMutation.error.value ?? launchMutation.error.value
    return failure ? failure.message : null
  })
  /** No-fly zone that blocked the last plan; the map highlights it. */
  const conflictGeofenceId = computed(() => {
    const failure = planMutation.error.value
    return failure instanceof MissionPlanningError ? failure.geofenceId : null
  })
  const busy = computed(() => planMutation.isPending.value || launchMutation.isPending.value)

  function reset() {
    step.value = 'details'
    name.value = 'Area Scan'
    altitude.value = DEFAULT_ALTITUDE
    uavCount.value = Math.min(DEFAULT_UAV_COUNT, Math.max(availableUavs.value, 1))
    area.value = []
    plan.value = null
    planMutation.reset()
    launchMutation.reset()
  }

  function start() {
    reset()
    open.value = true
  }

  function close() {
    open.value = false
  }

  function addPoint(point: GeoPoint) {
    if (step.value === 'area') area.value = [...area.value, point]
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
      area: { polygon: area.value },
      altitude: altitude.value,
      uavCount: uavCount.value,
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
    return plan.value
      ? { phase: 'planned' as const, area: area.value, routes: plan.value.routes }
      : { phase: 'draft' as const, area: area.value, routes: [] }
  })

  return {
    open,
    step,
    name,
    altitude,
    uavCount,
    area,
    availableUavs,
    detailErrors,
    areaReady,
    error,
    conflictGeofenceId,
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

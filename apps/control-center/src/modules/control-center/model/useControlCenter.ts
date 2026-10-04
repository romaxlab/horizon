import { isPointInPolygon, type Geofence, type GeoPoint, type MissionType } from '@horizon/domain'
import type { BadgeVariant } from '@horizon/ui'
import { useMutation } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useAppServices } from '@/app/providers/services'
import { useGeofences } from '@/modules/airspace'
import {
  healthIssues,
  useFleetStore,
  useFleetSync,
  type ConnectionStatus,
  type InspectorMission,
} from '@/modules/fleet'
import { useDemoControls } from '@/modules/demo-controls'
import { useIncidentCenter, type Observation } from '@/modules/incidents'
import { useMapStore, type GeofenceOverlay, type MissionOverlay } from '@/modules/map'
import {
  computeMissionProgress,
  MISSION_TYPES,
  type UavMissionStatus,
  provideMissionBuilder,
  useMissionBuilder,
  useMissionStore,
  useMissionSync,
} from '@/modules/mission-planning'
import { formatDuration } from '@/shared/lib/format'
import { stableComputed } from '@/shared/lib/stable-computed'

/** What UAVs on a mission of this type are doing, for the status line. */
const MISSION_ACTIVITY: Record<MissionType, string> = {
  area_scan: 'scanning',
  patrol: 'patrolling',
  point_inspection: 'inspecting',
}

/** One part of the mission status line, e.g. "3 scanning"; warnings stand out. */
export interface MissionPhaseCount {
  text: string
  tone: 'muted' | 'warning'
}

/** Inspector wording for a UAV's mission phase. */
function phaseLabel(type: MissionType, status: UavMissionStatus): string {
  const repeat = type === 'point_inspection' ? 'orbit' : 'lap'
  switch (status.phase) {
    case 'pending':
      return 'Waiting for launch'
    case 'en_route':
      return 'En route'
    case 'on_task': {
      const activity = MISSION_ACTIVITY[type]
      const label = activity.charAt(0).toUpperCase() + activity.slice(1)
      return status.lap
        ? `${label} · ${repeat} ${String(status.lap.current)} of ${String(status.lap.total)}`
        : label
    }
    case 'returning':
      return status.returnReason === 'low-battery'
        ? 'Returning · low battery'
        : status.returnReason === 'aborted'
          ? 'Returning · mission stopped'
          : 'Returning home'
    case 'landed':
      return 'Landed'
  }
}

/** The status line re-renders only when its visible content changes, not on every flush. */
const sameSummary = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)

const connectionPresentation: Record<ConnectionStatus, { label: string; variant: BadgeVariant }> = {
  connecting: { label: 'Connecting', variant: 'neutral' },
  live: { label: 'Live', variant: 'success' },
  reconnecting: { label: 'Reconnecting', variant: 'warning' },
}

const zoneAt = (zones: readonly Geofence[], point: GeoPoint) =>
  zones.find((zone) => isPointInPolygon(point, zone.polygon)) ?? null

/** Route-level composition for the Control Center: starts live sync and coordinates modules. */
export function useControlCenter() {
  const fleetSync = useFleetSync()
  const fleet = useFleetStore()
  const map = useMapStore()

  const connection = computed(() => connectionPresentation[fleet.connectionStatus])

  const missionSync = useMissionSync()
  const missions = useMissionStore()

  const missionProgress = computed(() => {
    const current = missions.current
    if (!current) return null
    // Only the mission's UAVs matter; don't walk the whole fleet on every flush.
    const telemetry = new Map(
      current.assignedUavIds.flatMap((id) => {
        const sample = fleet.uavsById[id]?.telemetry
        return sample ? [[id, sample] as const] : []
      }),
    )
    return computeMissionProgress(current, telemetry)
  })

  // Stable: the view only updates when the visible summary changes, not on every flush.
  const mission = stableComputed(() => {
    const current = missions.current
    const progress = missionProgress.value
    if (!current || !progress || current.status !== 'active') {
      return {
        // The header only names a mission while it is active.
        title: null,
        state: 'Standing by',
        detail: `${fleet.statusCounts.standby} UAVs ready`,
        phases: null,
        progress: null,
      }
    }
    // Exceptions stand out: a low-battery return is counted apart, in warning tone.
    const count = (match: (u: UavMissionStatus) => boolean) => progress.uavs.filter(match).length
    const lowBattery = (u: UavMissionStatus) =>
      u.phase === 'returning' && u.returnReason === 'low-battery'
    const counts: (MissionPhaseCount & { n: number })[] = [
      { text: 'en route', n: count((u) => u.phase === 'en_route'), tone: 'muted' },
      {
        text: MISSION_ACTIVITY[current.type],
        n: count((u) => u.phase === 'on_task'),
        tone: 'muted',
      },
      {
        text: 'returning',
        n: count((u) => u.phase === 'returning' && !lowBattery(u)),
        tone: 'muted',
      },
      { text: 'low battery', n: count(lowBattery), tone: 'warning' },
    ]
    const phases: MissionPhaseCount[] = counts
      .filter((p) => p.n > 0)
      .map((p) => ({ text: `${String(p.n)} ${p.text}`, tone: p.tone }))
    if (progress.etaSec !== null && progress.etaSec > 0) {
      phases.push({ text: `ETA ${formatDuration(progress.etaSec)}`, tone: 'muted' })
    }
    return {
      title: current.name,
      // Floor: 100% only once every UAV has landed (the mission then completes).
      state: `${Math.floor(progress.ratio * 100)}%`,
      detail: phases.map((p) => p.text).join(' · '),
      phases,
      progress: progress.ratio,
    }
  }, sameSummary)

  const builder = useMissionBuilder({
    availableUavs: computed(() => fleet.statusCounts.standby),
  })
  provideMissionBuilder(builder)
  const canCreateMission = computed(
    () => missions.current?.status !== 'active' && !builder.open.value,
  )

  const { geofences } = useGeofences()
  /** Zones a flying UAV is currently inside; stable so the map only redraws on change. */
  const breachedZoneIds = stableComputed(
    () =>
      geofences.value
        .filter((zone) =>
          fleet.uavs.some(
            (state) =>
              state.telemetry !== null &&
              state.telemetry.flightPhase !== 'parked' &&
              isPointInPolygon(state.telemetry.position, zone.polygon),
          ),
        )
        .map((zone) => zone.id),
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  )
  const geofenceOverlay = computed<GeofenceOverlay[]>(() =>
    geofences.value.map((zone) => ({
      ...zone,
      highlighted:
        builder.conflictGeofenceIds.value.includes(zone.id) ||
        breachedZoneIds.value.includes(zone.id),
    })),
  )

  const { missionPlanner, demoControl } = useAppServices()
  const abortMutation = useMutation({
    mutationFn: (missionId: string) => missionPlanner.abort(missionId),
  })
  function stopMission() {
    const current = missions.current
    if (current?.status === 'active') abortMutation.mutate(current.id)
  }
  const missionActive = computed(() => missions.current?.status === 'active')

  /** What incident detection observes; the incidents module never reads fleet state directly. */
  // Read on the incident center's own cadence (a few times per second), not on every flush.
  const observation = computed<Observation>(() => ({
    backendLive: fleet.connectionStatus !== 'reconnecting',
    mission: missions.current
      ? { id: missions.current.id, name: missions.current.name, status: missions.current.status }
      : null,
    uavs: fleet.uavs.map((state) => {
      const issues = state.telemetry ? healthIssues(state.telemetry) : []
      return {
        id: state.uav.id,
        name: state.uav.name,
        link: state.status === 'offline' ? 'offline' : state.status === 'stale' ? 'stale' : 'fresh',
        battery: state.telemetry?.battery ?? null,
        lowBattery: issues.includes('low-battery'),
        weakSignal: issues.includes('weak-signal'),
        geofence:
          state.telemetry && state.telemetry.flightPhase !== 'parked'
            ? (zoneAt(geofences.value, state.telemetry.position)?.name ?? null)
            : null,
      }
    }),
  }))
  const incidents = useIncidentCenter(() => observation.value)

  /** Incident "Inspect": the same path as selecting from the list, plus dismissing the alert. */
  function inspectIncident(incidentId: string | null, uavId: string) {
    if (incidentId) incidents.acknowledge(incidentId)
    selectUav(uavId, { focus: true })
  }

  /** Demo controls (mock backend + config only): commands go to the simulator, never to stores. */
  const demoTarget = stableComputed(
    () => {
      const state =
        fleet.selectedUav ?? fleet.uavs.find((s) => s.status === 'active') ?? fleet.uavs[0] ?? null
      return state
        ? {
            id: state.uav.id,
            name: state.uav.name,
            onMission: state.telemetry?.flightPhase === 'mission',
          }
        : null
    },
    (a, b) => a?.id === b?.id && a?.onMission === b?.onMission,
  )
  const demo = demoControl
    ? useDemoControls({
        control: demoControl,
        target: demoTarget,
        // UAVs still flying scan lines: "Complete mission" has something to end.
        missionScanning: computed(() => {
          const current = missions.current
          return (
            current?.status === 'active' &&
            current.assignedUavIds.some(
              (id) => fleet.uavsById[id]?.telemetry?.flightPhase === 'mission',
            )
          )
        }),
        diagnostics: {
          stats: fleetSync.stats,
          fleetSize: computed(() => fleet.uavs.length),
          connection: computed(() => connectionPresentation[fleet.connectionStatus].label),
        },
        // The backend state was replaced: resync through the normal snapshot path.
        onResync: () => {
          builder.close()
          incidents.clearHistory()
          void fleetSync.resync()
          void missionSync.reload()
        },
      })
    : null

  /** Camera feed inputs for the selected UAV; the video module only sees pose and link. */
  const selectedFeed = computed(() => {
    const state = fleet.selectedUav
    if (!state) return null
    const t = state.telemetry
    return {
      uavId: state.uav.id,
      label: state.uav.name,
      pose:
        t && state.lastUpdatedAt !== null
          ? {
              latitude: t.position.latitude,
              longitude: t.position.longitude,
              altitude: t.position.altitude,
              heading: t.heading,
              speed: t.speed,
              timestamp: t.timestamp,
              receivedAt: state.lastUpdatedAt,
            }
          : null,
      link:
        state.status === 'offline'
          ? ('offline' as const)
          : state.status === 'stale'
            ? ('stale' as const)
            : ('live' as const),
    }
  })

  /** The draft/plan while building, otherwise the current mission. */
  const missionOverlay = computed<MissionOverlay | null>(() => {
    if (builder.overlay.value) return builder.overlay.value
    const current = missions.current
    if (!current || current.status === 'draft' || current.status === 'planned') return null
    const phase = current.status === 'active' ? 'active' : 'completed'
    const shape = MISSION_TYPES[current.type].shape
    const orbit =
      current.target && current.radiusMeters !== null
        ? { target: current.target, radiusMeters: current.radiusMeters }
        : null
    return { phase, shape, orbit, area: current.area.polygon, routes: current.routes }
  })

  /**
   * One shared selection for list, map and inspector. Selecting from the list also flies the map
   * to the UAV; selecting on the map keeps the camera. Follow moves to the new selection or stops.
   */
  function selectUav(uavId: string | null, options: { focus?: boolean } = {}) {
    fleet.selectUav(uavId)
    if (map.followUavId !== null) map.setFollow(fleet.selectedUavId)
    if (options.focus && fleet.selectedUavId) map.focusUav(fleet.selectedUavId)
  }

  function focusSelected() {
    if (fleet.selectedUavId) map.focusUav(fleet.selectedUavId)
  }

  function toggleFollow() {
    map.setFollow(map.followUavId === null ? fleet.selectedUavId : null)
  }

  return {
    connection,
    mission,
    /** Live fleet stream for the map: deltas bypass component rendering. */
    fleetFeed: { current: () => fleet.uavs, subscribe: fleet.subscribe },
    selectedUavId: computed(() => fleet.selectedUavId),
    /** The selected UAV's part in the current mission, for the inspector. */
    selectedMission: computed<InspectorMission | null>(() => {
      const current = missions.current
      const uavId = fleet.selectedUavId
      const status = missionProgress.value?.uavs.find((u) => u.uavId === uavId)
      if (!current || !status || current.status !== 'active') return null
      const flying = status.phase !== 'pending' && status.phase !== 'landed'
      return {
        name: current.name,
        phase: phaseLabel(current.type, status),
        tone:
          status.phase === 'returning' && status.returnReason === 'low-battery'
            ? 'warning'
            : 'secondary',
        ratio: flying ? status.ratio : null,
        eta: flying && status.etaSec !== null ? `Lands in ${formatDuration(status.etaSec)}` : null,
      }
    }),
    inspectorOpen: computed(() => fleet.selectedUav !== null),
    following: computed(() => map.followUavId !== null),
    builder,
    selectedFeed,
    incidents,
    inspectIncident,
    demo,
    canCreateMission,
    missionActive,
    stopMission,
    stoppingMission: computed(() => abortMutation.isPending.value),
    stopError: computed(() => abortMutation.error.value?.message ?? null),
    missionOverlay,
    geofenceOverlay,
    selectUav,
    focusSelected,
    toggleFollow,
  }
}

import type { BadgeVariant } from '@horizon/ui'
import { useMutation } from '@tanstack/vue-query'
import { computed } from 'vue'
import { useAppServices } from '@/app/providers/services'
import { healthIssues, useFleetStore, useFleetSync, type ConnectionStatus } from '@/modules/fleet'
import { useDemoControls } from '@/modules/demo-controls'
import { useIncidentCenter, type Observation } from '@/modules/incidents'
import { useMapStore, type MissionOverlay } from '@/modules/map'
import {
  computeMissionProgress,
  provideMissionBuilder,
  useMissionBuilder,
  useMissionStore,
  useMissionSync,
} from '@/modules/mission-planning'
import { formatDuration } from '@/shared/lib/format'
import { stableComputed, shallowEqual } from '@/shared/lib/stable-computed'

const connectionPresentation: Record<ConnectionStatus, { label: string; variant: BadgeVariant }> = {
  connecting: { label: 'Connecting', variant: 'neutral' },
  live: { label: 'Live', variant: 'success' },
  reconnecting: { label: 'Reconnecting', variant: 'warning' },
}

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
        progress: null,
      }
    }
    const eta = progress.etaSec === null ? '' : ` · ETA ${formatDuration(progress.etaSec)}`
    const scanning = progress.activeUavCount > 0
    return {
      title: current.name,
      state: `${Math.round(progress.ratio * 100)}%`,
      detail: scanning
        ? `${progress.activeUavCount} UAVs scanning${eta}`
        : `${progress.returningUavCount} UAVs returning`,
      progress: progress.ratio,
    }
  }, shallowEqual)

  const builder = useMissionBuilder({
    availableUavs: computed(() => fleet.statusCounts.standby),
  })
  provideMissionBuilder(builder)
  const canCreateMission = computed(
    () => missions.current?.status !== 'active' && !builder.open.value,
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
      return state ? { id: state.uav.id, name: state.uav.name } : null
    },
    (a, b) => a?.id === b?.id,
  )
  const demo = demoControl
    ? useDemoControls({
        control: demoControl,
        target: demoTarget,
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
    return { phase, area: current.area.polygon, routes: current.routes }
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
    missionOverlay,
    selectUav,
    focusSelected,
    toggleFollow,
  }
}

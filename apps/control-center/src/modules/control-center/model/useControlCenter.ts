import type { BadgeVariant } from '@horizon/ui'
import { computed } from 'vue'
import { useAppServices } from '@/app/providers/services'
import { useAirspaceMonitor } from '@/modules/airspace'
import {
  healthIssues,
  linkOf,
  LOW_BATTERY_PCT,
  useFleetStore,
  useFleetSync,
  type ConnectionStatus,
  type InspectorMission,
} from '@/modules/fleet'
import { useDemoControls } from '@/modules/demo-controls'
import { useIncidentCenter, type Observation } from '@/modules/incidents'
import { useMapStore, type GeofenceOverlay, type MissionOverlay } from '@/modules/map'
import {
  MISSION_TYPES,
  provideMissionBuilder,
  useMissionBuilder,
  useMissionStatus,
  useMissionStore,
  useMissionSync,
} from '@/modules/mission-planning'
import { stableComputed } from '@/shared/lib/stable-computed'

const connectionPresentation: Record<ConnectionStatus, { label: string; variant: BadgeVariant }> = {
  connecting: { label: 'Connecting', variant: 'neutral' },
  live: { label: 'Live', variant: 'success' },
  reconnecting: { label: 'Reconnecting', variant: 'warning' },
}

/**
 * Route-level composition for the Control Center: starts live sync and wires modules together.
 * Module logic lives in the modules (mission status, airspace, incidents…); this composable only
 * feeds one module's data into another and coordinates selection and the camera.
 */
export function useControlCenter() {
  const missionSync = useMissionSync()
  // Missions ride the same stream: after a reconnect they reload too, since mission events sent
  // while disconnected were missed (e.g. a mission that completed during an outage).
  const fleetSync = useFleetSync({
    onReconnected: () => {
      void missionSync.reload()
    },
  })
  const fleet = useFleetStore()
  const map = useMapStore()
  const missions = useMissionStore()

  const missionStatus = useMissionStatus({
    telemetryOf: (uavId) => fleet.uavsById[uavId]?.telemetry ?? null,
    uavNameOf: (uavId) => fleet.uavsById[uavId]?.uav.name ?? null,
    standbyCount: computed(() => fleet.statusCounts.standby),
    lowBatteryPct: LOW_BATTERY_PCT,
  })

  const builder = useMissionBuilder({
    availableUavs: computed(() => fleet.statusCounts.standby),
  })
  provideMissionBuilder(builder)

  const airspace = useAirspaceMonitor(() =>
    fleet.uavs.flatMap((state) =>
      state.telemetry && state.telemetry.flightPhase !== 'parked'
        ? [{ id: state.uav.id, position: state.telemetry.position }]
        : [],
    ),
  )
  const geofenceOverlay = computed<GeofenceOverlay[]>(() =>
    airspace.geofences.value.map((zone) => ({
      ...zone,
      highlighted:
        builder.conflictGeofenceIds.value.includes(zone.id) ||
        airspace.breachedZoneIds.value.includes(zone.id),
    })),
  )

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
        link: linkOf(state.status),
        battery: state.telemetry?.battery ?? null,
        lowBattery: issues.includes('low-battery'),
        weakSignal: issues.includes('weak-signal'),
        geofence: airspace.breaches.value.get(state.uav.id)?.name ?? null,
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
  const { demoControl } = useAppServices()
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
        missionScanning: missionStatus.tasking,
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
      link: linkOf(state.status),
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
    connection: computed(() => connectionPresentation[fleet.connectionStatus]),
    mission: missionStatus.summary,
    /** Live fleet stream for the map: deltas bypass component rendering. */
    fleetFeed: { current: () => fleet.uavs, subscribe: fleet.subscribe },
    selectedUavId: computed(() => fleet.selectedUavId),
    /** The selected UAV's part in the current mission, for the inspector. */
    selectedMission: computed<InspectorMission | null>(
      () => missionStatus.uavRows.value.find((row) => row.uavId === fleet.selectedUavId) ?? null,
    ),
    missionUavs: missionStatus.uavRows,
    inspectorOpen: computed(() => fleet.selectedUav !== null),
    following: computed(() => map.followUavId !== null),
    builder,
    selectedFeed,
    incidents,
    inspectIncident,
    demo,
    canCreateMission: computed(() => !missionStatus.active.value && !builder.open.value),
    missionActive: missionStatus.active,
    stopMission: missionStatus.stop,
    stoppingMission: missionStatus.stopping,
    stopError: missionStatus.stopError,
    missionOverlay,
    geofenceOverlay,
    selectUav,
    focusSelected,
    toggleFollow,
    /** The layout reports what the floating panels cover, so the camera frames around them. */
    setMapViewportInsets: map.setViewportInsets,
  }
}

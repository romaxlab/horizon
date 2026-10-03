import type { UavState, UavTelemetry } from '@horizon/domain'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { deriveMissionState, deriveUavStatus } from './fleet.status'
import type { ConnectionStatus, FleetSnapshot } from './fleet.types'

function withTelemetry(state: UavState, telemetry: UavTelemetry, receivedAt: number): UavState {
  return {
    ...state,
    telemetry,
    status: deriveUavStatus(telemetry),
    missionState: deriveMissionState(telemetry),
    lastUpdatedAt: receivedAt,
  }
}

/** Current live fleet state, normalized by UAV id. Hydrated from snapshots, updated by realtime. */
export const useFleetStore = defineStore('fleet', () => {
  const uavIds = ref<string[]>([])
  const uavsById = ref<Record<string, UavState>>({})
  const connectionStatus = ref<ConnectionStatus>('connecting')
  /** Single shared selection, stored by id rather than as a duplicated object. */
  const selectedUavId = ref<string | null>(null)

  const uavs = computed(() =>
    uavIds.value.flatMap((id) => {
      const state = uavsById.value[id]
      return state ? [state] : []
    }),
  )

  /**
   * Reconciles a snapshot with the current state. Telemetry already received through the
   * realtime stream wins when it is newer than the snapshot sample.
   */
  function hydrate(snapshot: FleetSnapshot, receivedAt: number) {
    const telemetryById = new Map(snapshot.telemetry.map((t) => [t.uavId, t]))
    const next: Record<string, UavState> = {}

    for (const uav of snapshot.uavs) {
      const current = uavsById.value[uav.id]
      const sample = telemetryById.get(uav.id) ?? null
      const base: UavState = current
        ? { ...current, uav }
        : {
            uav,
            telemetry: null,
            status: deriveUavStatus(null),
            missionState: deriveMissionState(null),
            lastUpdatedAt: null,
          }
      const isNewer = sample && (!base.telemetry || sample.timestamp > base.telemetry.timestamp)
      // Age snapshot samples relative to the server clock so old telemetry does not look fresh.
      next[uav.id] = isNewer
        ? withTelemetry(base, sample, receivedAt - (snapshot.serverTime - sample.timestamp))
        : base
    }

    uavIds.value = snapshot.uavs.map((uav) => uav.id)
    uavsById.value = next
    if (selectedUavId.value !== null && !(selectedUavId.value in next)) selectedUavId.value = null
  }

  /** Applies a batch of ordered, coalesced telemetry. Unknown UAVs are ignored. */
  function applyTelemetry(batch: UavTelemetry[], receivedAt: number): number {
    let ignored = 0
    for (const telemetry of batch) {
      const current = uavsById.value[telemetry.uavId]
      if (!current) {
        ignored += 1
        continue
      }
      uavsById.value[telemetry.uavId] = withTelemetry(current, telemetry, receivedAt)
    }
    return ignored
  }

  function selectUav(uavId: string | null) {
    selectedUavId.value = uavId !== null && uavId in uavsById.value ? uavId : null
  }

  function setConnectionStatus(status: ConnectionStatus) {
    connectionStatus.value = status
  }

  return {
    uavIds,
    uavsById,
    uavs,
    connectionStatus,
    selectedUavId,
    hydrate,
    selectUav,
    applyTelemetry,
    setConnectionStatus,
  }
})

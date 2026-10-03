import type { UavState, UavStatus, UavTelemetry } from '@horizon/domain'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import { deriveMissionState, deriveUavStatus } from './fleet.status'
import type { ConnectionStatus, FleetChange, FleetSnapshot } from './fleet.types'

function withTelemetry(
  state: UavState,
  telemetry: UavTelemetry,
  receivedAt: number,
  now: number,
): UavState {
  return {
    ...state,
    telemetry,
    status: deriveUavStatus(telemetry, receivedAt, now),
    missionState: deriveMissionState(telemetry),
    lastUpdatedAt: receivedAt,
  }
}

/** Current live fleet state, normalized by UAV id. Hydrated from snapshots, updated by realtime. */
export const useFleetStore = defineStore('fleet', () => {
  const uavIds = ref<string[]>([])
  /**
   * Shallow on purpose: UAV states are immutable snapshots replaced per update, so deep proxies
   * and per-key triggers would only add cost. One trigger per batch notifies dependents.
   */
  const uavsById = shallowRef<Record<string, UavState>>({})
  /** Non-reactive change stream for high-frequency consumers (map); see `subscribe`. */
  const listeners = new Set<(change: FleetChange) => void>()
  const notify = (change: FleetChange) => {
    listeners.forEach((listener) => {
      listener(change)
    })
  }
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
            status: deriveUavStatus(null, null, receivedAt),
            missionState: deriveMissionState(null),
            lastUpdatedAt: null,
          }
      const isNewer = sample && (!base.telemetry || sample.timestamp > base.telemetry.timestamp)
      // Age snapshot samples relative to the server clock so old telemetry does not look fresh.
      next[uav.id] = isNewer
        ? withTelemetry(
            base,
            sample,
            receivedAt - (snapshot.serverTime - sample.timestamp),
            receivedAt,
          )
        : base
    }

    uavIds.value = snapshot.uavs.map((uav) => uav.id)
    uavsById.value = next
    if (selectedUavId.value !== null && !(selectedUavId.value in next)) selectedUavId.value = null
    notify({ kind: 'reset' })
  }

  /** Applies a batch of ordered, coalesced telemetry. Unknown UAVs are ignored. */
  function applyTelemetry(batch: UavTelemetry[], receivedAt: number): number {
    let ignored = 0
    const record = uavsById.value
    const changed: UavState[] = []
    for (const telemetry of batch) {
      const current = record[telemetry.uavId]
      if (!current) {
        ignored += 1
        continue
      }
      const next = withTelemetry(current, telemetry, receivedAt, receivedAt)
      record[telemetry.uavId] = next
      changed.push(next)
    }
    if (changed.length > 0) commit(changed)
    return ignored
  }

  /** One reactive trigger and one change notification per batch. */
  function commit(changed: UavState[]) {
    triggerRef(uavsById)
    notify({ kind: 'update', changed })
  }

  /** Subscribe to fleet changes without going through component rendering. */
  function subscribe(listener: (change: FleetChange) => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  /**
   * Re-derives time-dependent status (stale/offline) without new telemetry. Only UAVs whose
   * status actually changes are replaced, so idle ticks don't trigger re-renders.
   */
  function refreshStatuses(now: number) {
    const record = uavsById.value
    const changed: UavState[] = []
    for (const id of uavIds.value) {
      const state = record[id]
      if (!state) continue
      const status = deriveUavStatus(state.telemetry, state.lastUpdatedAt, now)
      if (status === state.status) continue
      const next = { ...state, status }
      record[id] = next
      changed.push(next)
    }
    if (changed.length > 0) commit(changed)
  }

  /** Counts by status for summaries and filters. */
  const statusCounts = computed(() => {
    const counts: Record<UavStatus, number> = {
      standby: 0,
      active: 0,
      warning: 0,
      stale: 0,
      offline: 0,
    }
    for (const state of uavs.value) counts[state.status] += 1
    return counts
  })

  const selectedUav = computed(() =>
    selectedUavId.value ? (uavsById.value[selectedUavId.value] ?? null) : null,
  )

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
    selectedUav,
    statusCounts,
    hydrate,
    refreshStatuses,
    subscribe,
    selectUav,
    applyTelemetry,
    setConnectionStatus,
  }
})

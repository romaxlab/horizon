import type { Uav, UavState, UavTelemetry } from '@horizon/domain'

export interface FleetSnapshot {
  serverTime: number
  uavs: Uav[]
  telemetry: UavTelemetry[]
}

/** Source of fleet snapshots. Mock and remote implementations share this contract. */
export interface FleetRepository {
  getSnapshot(signal?: AbortSignal): Promise<FleetSnapshot>
}

/** Backend link: `reconnecting` keeps last known state while the stream is re-established. */
export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting'

/** Fleet change notification: a full reset (snapshot) or the UAVs updated in one batch. */
export type FleetChange = { kind: 'reset' } | { kind: 'update'; changed: readonly UavState[] }

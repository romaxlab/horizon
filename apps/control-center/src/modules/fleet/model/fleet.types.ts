import type { Uav, UavTelemetry } from '@horizon/domain'

export interface FleetSnapshot {
  serverTime: number
  uavs: Uav[]
  telemetry: UavTelemetry[]
}

/** Source of fleet snapshots. Mock and remote implementations share this contract. */
export interface FleetRepository {
  getSnapshot(signal?: AbortSignal): Promise<FleetSnapshot>
}

export type ConnectionStatus = 'connecting' | 'live' | 'offline'

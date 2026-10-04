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

/** A UAV's part in the current mission, as shown in the inspector (built by the composition). */
export interface InspectorMission {
  name: string
  /** e.g. "En route", "Patrolling · lap 2 of 3", "Returning · low battery". */
  phase: string
  tone: 'secondary' | 'warning'
  /** 0–1 share of this UAV's flight covered; null when not flying the mission. */
  ratio: number | null
  /** e.g. "Lands in 4:12". */
  eta: string | null
  /** Estimated battery on landing, e.g. "≈ 27%"; warning when it would land below the reserve. */
  landingBattery: { label: string; tone: 'secondary' | 'warning' } | null
}

/** Fleet change notification: a full reset (snapshot) or the UAVs updated in one batch. */
export type FleetChange = { kind: 'reset' } | { kind: 'update'; changed: readonly UavState[] }

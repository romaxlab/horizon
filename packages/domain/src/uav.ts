import type { GeoPosition } from './geo'

export interface Uav {
  id: string
  name: string
  model: string
  callsign: string
  capabilities: {
    camera: boolean
    thermalCamera: boolean
  }
}

export interface UavTelemetry {
  uavId: string
  /** Epoch milliseconds at which the sample was produced. */
  timestamp: number
  position: GeoPosition
  /** Ground speed, m/s. */
  speed: number
  /** Degrees clockwise from true north, 0–360. */
  heading: number
  /** Remaining battery, 0–100 %. */
  battery: number
  /** Link quality, 0–100 %. */
  signal: number
  gpsSatellites: number
  missionId: string | null
  currentWaypoint: number | null
  flightPhase: FlightPhase
  /** Why a returning UAV is heading home; null otherwise. */
  returnReason: ReturnReason | null
}

export type FlightPhase = 'parked' | 'mission' | 'returning'

export type ReturnReason = 'completed' | 'aborted' | 'low-battery'

export type UavStatus = 'standby' | 'active' | 'warning' | 'stale' | 'offline'

export type MissionExecutionState = 'idle' | 'assigned' | 'executing' | 'completed'

export interface UavState {
  uav: Uav
  telemetry: UavTelemetry | null
  status: UavStatus
  missionState: MissionExecutionState
  /** Epoch milliseconds when the latest telemetry was received. */
  lastUpdatedAt: number | null
}

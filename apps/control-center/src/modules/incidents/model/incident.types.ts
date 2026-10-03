import type { EventSeverity, OperationalEvent, OperationalEventType } from '@horizon/domain'

/** Per-UAV facts the detector compares between observations. */
export interface UavObservation {
  id: string
  name: string
  /** `stale` / `offline` mean telemetry is late or missing. */
  link: 'fresh' | 'stale' | 'offline'
  battery: number | null
  lowBattery: boolean
  weakSignal: boolean
  /** Name of the no-fly zone the UAV is flying in; null outside restricted airspace. */
  geofence: string | null
}

export interface MissionObservation {
  id: string
  name: string
  status: 'draft' | 'planned' | 'active' | 'completed' | 'aborted'
}

export interface Observation {
  /** Backend link; while it is down, per-UAV link events are suppressed. */
  backendLive: boolean
  uavs: UavObservation[]
  mission: MissionObservation | null
}

/** An operational event as shown to the operator. */
export interface Incident extends OperationalEvent {
  uavName: string | null
  detail: string | null
  /** Condition cleared (e.g. connection restored). */
  resolved: boolean
  /** Dismissed by the operator. */
  acknowledged: boolean
}

export type NewIncident = Omit<Incident, 'id' | 'timestamp' | 'resolved' | 'acknowledged'>

/** Clears earlier alerts of these types for a UAV (null: backend-level). */
export interface Resolution {
  uavId: string | null
  types: OperationalEventType[]
}

export const severityOf: Record<OperationalEventType, EventSeverity> = {
  MISSION_STARTED: 'info',
  WAYPOINT_REACHED: 'info',
  MISSION_COMPLETED: 'info',
  MISSION_ABORTED: 'warning',
  GEOFENCE_BREACH: 'critical',
  LOW_BATTERY: 'critical',
  SIGNAL_DEGRADED: 'warning',
  TELEMETRY_STALE: 'warning',
  CONNECTION_LOST: 'critical',
  CONNECTION_RESTORED: 'info',
}

export type EventSeverity = 'info' | 'warning' | 'critical'

export type OperationalEventType =
  | 'MISSION_STARTED'
  | 'WAYPOINT_REACHED'
  | 'LOW_BATTERY'
  | 'SIGNAL_DEGRADED'
  | 'TELEMETRY_STALE'
  | 'CONNECTION_LOST'
  | 'CONNECTION_RESTORED'
  | 'MISSION_COMPLETED'

export interface OperationalEvent {
  id: string
  type: OperationalEventType
  severity: EventSeverity
  timestamp: number
  uavId: string | null
  missionId: string | null
}

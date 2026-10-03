import type { MissionExecutionState, UavStatus, UavTelemetry } from '@horizon/domain'

// Health-based states (warning/stale/offline) are derived together with fleet monitoring.
export function deriveUavStatus(telemetry: UavTelemetry | null): UavStatus {
  return telemetry?.missionId ? 'active' : 'standby'
}

export function deriveMissionState(telemetry: UavTelemetry | null): MissionExecutionState {
  return telemetry?.missionId ? 'executing' : 'idle'
}

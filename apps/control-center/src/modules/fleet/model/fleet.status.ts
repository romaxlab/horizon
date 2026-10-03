import type { MissionExecutionState, UavStatus, UavTelemetry } from '@horizon/domain'

/** No telemetry for longer than this marks a UAV stale. Parked UAVs report about once a second. */
export const STALE_AFTER_MS = 5_000
/** No telemetry for longer than this marks a UAV offline. */
export const OFFLINE_AFTER_MS = 15_000
export const LOW_BATTERY_PCT = 20
export const WEAK_SIGNAL_PCT = 35
export const MIN_GPS_SATELLITES = 6

export type HealthIssue = 'low-battery' | 'weak-signal' | 'poor-gps'

/** Health problems in a telemetry sample, most severe first. */
export function healthIssues(telemetry: UavTelemetry): HealthIssue[] {
  const issues: HealthIssue[] = []
  if (telemetry.battery < LOW_BATTERY_PCT) issues.push('low-battery')
  if (telemetry.signal < WEAK_SIGNAL_PCT) issues.push('weak-signal')
  if (telemetry.gpsSatellites < MIN_GPS_SATELLITES) issues.push('poor-gps')
  return issues
}

/**
 * Operational status, by precedence: link freshness (offline > stale) first, then health
 * (warning), then activity (active / standby). Last known telemetry is kept regardless.
 */
export function deriveUavStatus(
  telemetry: UavTelemetry | null,
  lastUpdatedAt: number | null,
  now: number,
): UavStatus {
  if (!telemetry || lastUpdatedAt === null) return 'offline'
  const age = now - lastUpdatedAt
  if (age > OFFLINE_AFTER_MS) return 'offline'
  if (age > STALE_AFTER_MS) return 'stale'
  if (healthIssues(telemetry).length > 0) return 'warning'
  return telemetry.missionId ? 'active' : 'standby'
}

export function deriveMissionState(telemetry: UavTelemetry | null): MissionExecutionState {
  return telemetry?.missionId ? 'executing' : 'idle'
}

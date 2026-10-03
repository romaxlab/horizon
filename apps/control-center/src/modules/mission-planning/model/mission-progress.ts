import { distanceMeters, type GeoPoint, type Mission, type UavTelemetry } from '@horizon/domain'

export interface MissionProgress {
  completedWaypoints: number
  totalWaypoints: number
  /** 0–1, derived from waypoints reached across all routes. */
  ratio: number
  /** UAVs still flying their scan route. */
  activeUavCount: number
  /** Remaining time of the slowest route, seconds; null when not running. */
  etaSec: number | null
}

/**
 * Progress derived from route execution rather than elapsed time: each route counts the
 * waypoints its UAV has passed; ETA is the slowest route's remaining path at its planned speed.
 */
export function computeMissionProgress(
  mission: Mission,
  telemetryByUav: ReadonlyMap<string, UavTelemetry>,
): MissionProgress {
  let completed = 0
  let total = 0
  let activeUavCount = 0
  let etaSec = 0

  for (const route of mission.routes) {
    const count = route.waypoints.length
    total += count
    const telemetry = telemetryByUav.get(route.uavId)
    const onThisMission = telemetry?.missionId === mission.id
    const reached =
      mission.status === 'completed'
        ? count
        : onThisMission
          ? Math.min(telemetry.currentWaypoint ?? 0, count)
          : 0
    completed += reached
    if (mission.status !== 'active' || !onThisMission || reached >= count) continue

    activeUavCount += 1
    const speed =
      route.estimatedDurationSec > 0 ? route.distanceMeters / route.estimatedDurationSec : 0
    if (speed <= 0) continue
    let remaining = 0
    let from: GeoPoint = telemetry.position
    for (const waypoint of route.waypoints.slice(reached)) {
      remaining += distanceMeters(from, waypoint)
      from = waypoint
    }
    etaSec = Math.max(etaSec, remaining / speed)
  }

  return {
    completedWaypoints: completed,
    totalWaypoints: total,
    ratio: total > 0 ? completed / total : 0,
    activeUavCount,
    etaSec: mission.status === 'active' ? Math.round(etaSec) : null,
  }
}

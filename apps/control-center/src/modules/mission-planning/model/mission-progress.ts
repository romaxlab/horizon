import {
  distanceMeters,
  type GeoPoint,
  type Mission,
  type UavRoute,
  type UavTelemetry,
} from '@horizon/domain'

export interface MissionProgress {
  completedWaypoints: number
  totalWaypoints: number
  /**
   * 0–1 share of the whole flight distance covered: transit from base, the mission route and the
   * flight home. It moves from take-off and reaches 1 only when every UAV has landed, i.e. when
   * the mission completes.
   */
  ratio: number
  /** UAVs still flying their mission route (incl. transit to it). */
  activeUavCount: number
  /** UAVs of this mission flying home (finished, stopped or low battery). */
  returningUavCount: number
  /** Time until the last UAV lands, seconds; null when not running. */
  etaSec: number | null
}

/** Planned flight path of a route: base → waypoints → base (without base when not reported). */
function flightPath(route: UavRoute): GeoPoint[] {
  return route.home ? [route.home, ...route.waypoints, route.home] : route.waypoints
}

function cumulativeDistances(path: GeoPoint[]): number[] {
  return path.reduce<number[]>((acc, point, i) => {
    const previous = path[i - 1]
    acc.push((acc[i - 1] ?? 0) + (previous ? distanceMeters(previous, point) : 0))
    return acc
  }, [])
}

/**
 * Distance flown along a route's planned path. Within the current leg it is the leg's length
 * minus what is left to its end, clamped to the leg, so progress never jumps backwards.
 */
function distanceFlown(route: UavRoute, path: GeoPoint[], cumulative: number[], t: UavTelemetry) {
  const total = cumulative.at(-1) ?? 0
  const offset = route.home ? 1 : 0
  if (t.flightPhase === 'returning') {
    // Heading home (also after a stop or low battery): what remains is the way home.
    const reached = Math.min(t.currentWaypoint ?? 0, route.waypoints.length)
    // Path index of the last waypoint passed (the base when none, if reported).
    const reachedEnd = reached + offset > 0 ? (cumulative[reached + offset - 1] ?? 0) : 0
    const home = route.home
    return home ? Math.max(reachedEnd, total - distanceMeters(t.position, home)) : reachedEnd
  }
  const target = Math.min((t.currentWaypoint ?? 0) + offset, path.length - 1)
  const end = path[target]
  const legEnd = cumulative[target] ?? 0
  const legStart = cumulative[target - 1] ?? 0
  if (!end) return 0
  return Math.min(legEnd, Math.max(legStart, legEnd - distanceMeters(t.position, end)))
}

/**
 * Progress derived from the flown path rather than elapsed time. Routes weigh by length; ETA is
 * the slowest route's remaining distance (incl. the way home) at its planned speed.
 */
export function computeMissionProgress(
  mission: Mission,
  telemetryByUav: ReadonlyMap<string, UavTelemetry>,
): MissionProgress {
  let completedWaypoints = 0
  let totalWaypoints = 0
  let flown = 0
  let planned = 0
  let activeUavCount = 0
  let returningUavCount = 0
  let etaSec = 0

  for (const route of mission.routes) {
    const count = route.waypoints.length
    const path = flightPath(route)
    const cumulative = cumulativeDistances(path)
    const total = cumulative.at(-1) ?? 0
    totalWaypoints += count
    planned += total

    const telemetry = telemetryByUav.get(route.uavId)
    const onThisMission = telemetry?.missionId === mission.id
    // A UAV leaves the mission when it lands (finished, stopped or low battery); samples from
    // before the launch don't count, they predate the assignment.
    const hasLanded =
      mission.status === 'completed' ||
      (mission.status === 'active' &&
        telemetry !== undefined &&
        !onThisMission &&
        mission.startedAt !== null &&
        telemetry.timestamp > mission.startedAt)

    if (hasLanded) {
      completedWaypoints += count
      flown += total
      continue
    }
    if (!onThisMission) continue

    completedWaypoints += Math.min(telemetry.currentWaypoint ?? 0, count)
    const done = distanceFlown(route, path, cumulative, telemetry)
    flown += done
    if (telemetry.flightPhase === 'returning') returningUavCount += 1
    else activeUavCount += 1

    const speed =
      route.estimatedDurationSec > 0 ? route.distanceMeters / route.estimatedDurationSec : 0
    if (mission.status === 'active' && speed > 0) {
      etaSec = Math.max(etaSec, (total - done) / speed)
    }
  }

  return {
    completedWaypoints,
    totalWaypoints,
    ratio: planned > 0 ? flown / planned : 0,
    activeUavCount,
    returningUavCount,
    etaSec: mission.status === 'active' ? Math.round(etaSec) : null,
  }
}

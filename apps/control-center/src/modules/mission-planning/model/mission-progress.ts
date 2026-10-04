import {
  distanceMeters,
  type GeoPoint,
  type Mission,
  type ReturnReason,
  type UavRoute,
  type UavTelemetry,
} from '@horizon/domain'

/**
 * Where one UAV is in its mission: `pending` before launch, `en_route` on transit from the base,
 * `on_task` scanning / patrolling / orbiting, `returning` home, `landed` back at the base.
 */
export type UavMissionPhase = 'pending' | 'en_route' | 'on_task' | 'returning' | 'landed'

export interface UavMissionStatus {
  uavId: string
  phase: UavMissionPhase
  /** Why a returning UAV is heading home. */
  returnReason: ReturnReason | null
  /** Current lap or orbit (1-based) of a repeating task while on task; null otherwise. */
  lap: { current: number; total: number } | null
  /** 0–1 share of this UAV's whole flight (transit, task, way home) covered. */
  ratio: number
  /** Time until this UAV lands, seconds; null when not flying. */
  etaSec: number | null
  flownMeters: number
  plannedMeters: number
}

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
  /** Per-UAV status, in route order. */
  uavs: UavMissionStatus[]
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

/** Lap of a repeating task: the start waypoint opens it, then every `lapSize` waypoints. */
function currentLap(route: UavRoute, laps: number | null, nextWaypoint: number) {
  if (route.lapSize === null || laps === null) return null
  const passed = Math.max(0, nextWaypoint - route.taskStart - 1)
  return { current: Math.min(laps, Math.floor(passed / route.lapSize) + 1), total: laps }
}

/** One UAV's place in the mission, derived from its route and latest telemetry. */
export function uavMissionStatus(
  mission: Mission,
  route: UavRoute,
  telemetry: UavTelemetry | undefined,
): UavMissionStatus {
  const path = flightPath(route)
  const cumulative = cumulativeDistances(path)
  const plannedMeters = cumulative.at(-1) ?? 0
  const base = { uavId: route.uavId, returnReason: null, lap: null, plannedMeters }

  const onThisMission = telemetry?.missionId === mission.id
  // A UAV leaves the mission when it lands (finished, stopped or low battery); samples from
  // before the launch don't count, they predate the assignment.
  const landed =
    mission.status === 'completed' ||
    (mission.status === 'active' &&
      telemetry !== undefined &&
      !onThisMission &&
      mission.startedAt !== null &&
      telemetry.timestamp > mission.startedAt)
  if (landed) {
    return { ...base, phase: 'landed', ratio: 1, etaSec: null, flownMeters: plannedMeters }
  }
  if (!onThisMission) {
    return { ...base, phase: 'pending', ratio: 0, etaSec: null, flownMeters: 0 }
  }

  const flownMeters = distanceFlown(route, path, cumulative, telemetry)
  const speed =
    route.estimatedDurationSec > 0 ? route.distanceMeters / route.estimatedDurationSec : 0
  const etaSec =
    mission.status === 'active' && speed > 0
      ? Math.round((plannedMeters - flownMeters) / speed)
      : null
  const ratio = plannedMeters > 0 ? flownMeters / plannedMeters : 0
  const next = telemetry.currentWaypoint ?? 0

  if (telemetry.flightPhase === 'returning') {
    return {
      ...base,
      phase: 'returning',
      returnReason: telemetry.returnReason,
      ratio,
      etaSec,
      flownMeters,
    }
  }
  // Heading for the task's first waypoint means still in transit.
  if (next <= route.taskStart) {
    return { ...base, phase: 'en_route', ratio, etaSec, flownMeters }
  }
  return {
    ...base,
    phase: 'on_task',
    lap: currentLap(route, mission.laps, next),
    ratio,
    etaSec,
    flownMeters,
  }
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
  let etaSec = 0

  const uavs = mission.routes.map((route) => {
    const telemetry = telemetryByUav.get(route.uavId)
    const status = uavMissionStatus(mission, route, telemetry)
    const count = route.waypoints.length
    totalWaypoints += count
    completedWaypoints +=
      status.phase === 'landed'
        ? count
        : status.phase === 'pending'
          ? 0
          : Math.min(telemetry?.currentWaypoint ?? 0, count)
    flown += status.flownMeters
    planned += status.plannedMeters
    etaSec = Math.max(etaSec, status.etaSec ?? 0)
    return status
  })

  const count = (phase: UavMissionPhase) => uavs.filter((u) => u.phase === phase).length
  return {
    completedWaypoints,
    totalWaypoints,
    ratio: planned > 0 ? flown / planned : 0,
    activeUavCount: count('en_route') + count('on_task'),
    returningUavCount: count('returning'),
    etaSec: mission.status === 'active' ? etaSec : null,
    uavs,
  }
}

import { distanceMeters, type GeoPoint, type UavRoute, type Waypoint } from '@horizon/domain'
import type { AirspaceRouter } from './airspace-routing'

export interface PatrolRequest {
  /** Corners of the closed patrol loop, in flight order. */
  loop: GeoPoint[]
  /** Patrol altitude, meters. */
  altitude: number
  laps: number
  /** UAVs in assignment order, with the position they depart from and return to. */
  uavs: { id: string; home: GeoPoint }[]
  cruiseSpeedMps: number
  airspace?: AirspaceRouter
}

export class PatrolError extends Error {
  override name = 'PatrolError'
}

/** Point at distance `d` along a polyline with cumulative distances `cumulative`. */
function pointAt(ring: GeoPoint[], cumulative: number[], d: number): GeoPoint {
  const i = cumulative.findIndex((c, k) => k > 0 && c >= d)
  const a = ring[i - 1] ?? ring[0]
  const b = ring[i] ?? a
  const ca = cumulative[i - 1] ?? 0
  const cb = cumulative[i] ?? ca
  if (!a || !b) return { latitude: 0, longitude: 0 }
  const t = cb > ca ? (d - ca) / (cb - ca) : 0
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  }
}

const pathDistance = (path: GeoPoint[]) =>
  path.slice(1).reduce((sum, point, i) => sum + distanceMeters(path[i] ?? point, point), 0)

/**
 * Deterministic patrol of a closed loop. All UAVs fly the same loop in the same direction,
 * spaced evenly along its length, so the loop is revisited every `length / n` of flight. Each UAV
 * flies `laps` full circuits from its start point and ends there; the return home is routed at
 * flight time. Legs crossing no-fly zones (loop and transit) detour around them.
 */
export function planPatrol(request: PatrolRequest): UavRoute[] {
  const { loop, altitude, laps, uavs, cruiseSpeedMps, airspace } = request
  if (loop.length < 3) throw new PatrolError('A patrol route needs at least 3 points')
  if (uavs.length === 0) throw new PatrolError('At least one UAV is required')
  if (!(Number.isInteger(laps) && laps >= 1)) throw new PatrolError('Laps must be at least 1')

  const first = loop[0] ?? { latitude: 0, longitude: 0 }
  const closed = airspace ? airspace.routePath([...loop, first]) : [...loop, first]
  if (!closed) throw new PatrolError('No clear path around the no-fly zones')
  const cumulative = closed.reduce<number[]>((acc, point, i) => {
    const previous = closed[i - 1]
    acc.push((acc[i - 1] ?? 0) + (previous ? distanceMeters(previous, point) : 0))
    return acc
  }, [])
  const length = cumulative.at(-1) ?? 0
  if (length < 1) throw new PatrolError('The patrol route is too short')
  // Corners of one circuit (the closing point repeats the first one).
  const ring = closed.slice(0, -1)

  return uavs.map((uav, index) => {
    const offset = (index * length) / uavs.length
    const start = pointAt(closed, cumulative, offset)
    const ahead = ring.filter((_, k) => (cumulative[k] ?? 0) > offset)
    const behind = ring.filter((_, k) => (cumulative[k] ?? 0) <= offset)
    // One circuit from the start point back to it; skip a corner that coincides with the start.
    const circuit = [...ahead, ...behind].filter((p) => distanceMeters(p, start) > 0.5)
    circuit.push(start)
    const scan = [start, ...Array.from({ length: laps }, () => circuit).flat()]

    const transit = airspace?.route(uav.home, start) ?? []
    const back = airspace?.route(start, uav.home) ?? []
    const points = [...transit, ...scan]
    const waypoints: Waypoint[] = points.map((point, order) => ({
      id: `${uav.id}-wp-${order}`,
      latitude: point.latitude,
      longitude: point.longitude,
      altitude,
      order,
    }))
    const distance = pathDistance([uav.home, ...points, ...back, uav.home])
    return {
      uavId: uav.id,
      home: uav.home,
      waypoints,
      distanceMeters: Math.round(distance),
      estimatedDurationSec: Math.round(distance / cruiseSpeedMps),
    }
  })
}

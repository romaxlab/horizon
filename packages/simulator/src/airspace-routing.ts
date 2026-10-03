import {
  distanceMeters,
  isPointInPolygon,
  pathEntersPolygon,
  type Geofence,
  type GeoPoint,
} from '@horizon/domain'

/** Distance kept between flight paths and a no-fly zone boundary. */
const KEEP_OUT_METERS = 30
/** Detour corners sit a little further out, so legs between them clear the keep-out area. */
const CORNER_METERS = 45

const METERS_PER_DEGREE = 111_194.93

/**
 * Grows a polygon by `meters` (vertices moved along their edge-normal bisectors). Exact for
 * convex zones; adequate for mildly concave ones.
 */
function inflate(polygon: readonly GeoPoint[], meters: number): GeoPoint[] {
  const origin = polygon[0] ?? { latitude: 0, longitude: 0 }
  const cosLat = Math.cos((origin.latitude * Math.PI) / 180)
  const local = polygon.map((p) => ({
    x: (p.longitude - origin.longitude) * cosLat * METERS_PER_DEGREE,
    y: (p.latitude - origin.latitude) * METERS_PER_DEGREE,
  }))
  const n = local.length
  const signedArea = local.reduce((sum, a, i) => {
    const b = local[(i + 1) % n] ?? a
    return sum + a.x * b.y - b.x * a.y
  }, 0)
  // Outward normal of edge a→b: right-hand for counter-clockwise rings, left-hand otherwise.
  const orientation = signedArea > 0 ? 1 : -1
  const normal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return {
      x: (orientation * (b.y - a.y)) / length,
      y: (orientation * -(b.x - a.x)) / length,
    }
  }
  return local.map((v, i) => {
    const prev = local[(i - 1 + n) % n] ?? v
    const next = local[(i + 1) % n] ?? v
    const n1 = normal(prev, v)
    const n2 = normal(v, next)
    const scale = meters / Math.max(0.2, 1 + n1.x * n2.x + n1.y * n2.y)
    const x = v.x + (n1.x + n2.x) * scale
    const y = v.y + (n1.y + n2.y) * scale
    return {
      latitude: origin.latitude + y / METERS_PER_DEGREE,
      longitude: origin.longitude + x / (cosLat * METERS_PER_DEGREE),
    }
  })
}

export interface AirspaceRouter {
  /** Areas flight paths must stay out of: zones plus the routing margin. */
  readonly exclusions: readonly GeoPoint[][]
  /** Whether the straight leg stays clear of every no-fly zone. */
  isClear(from: GeoPoint, to: GeoPoint): boolean
  /**
   * Shortest detour from `from` to `to` around no-fly zones: the intermediate turn points
   * (empty when the straight leg is clear), or null when no clear path exists.
   */
  route(from: GeoPoint, to: GeoPoint): GeoPoint[] | null
  /** Length of the routed path, meters (straight distance when unroutable). */
  distance(from: GeoPoint, to: GeoPoint): number
}

/**
 * Detours around no-fly zones via a visibility graph: nodes are the inflated zone corners,
 * edges are legs that stay out of every keep-out area; Dijkstra picks the shortest path.
 * Graphs stay tiny (a few corners per zone), so routing is cheap enough to run per return.
 */
export function createAirspaceRouter(zones: readonly Geofence[]): AirspaceRouter {
  const keepOut = zones.map((zone) => inflate(zone.polygon, KEEP_OUT_METERS))
  const exclusions = zones.map((zone) => inflate(zone.polygon, CORNER_METERS))
  const insideAny = (p: GeoPoint) => keepOut.some((polygon) => isPointInPolygon(p, polygon))
  const corners = exclusions.flat().filter((corner) => !insideAny(corner))

  function isClear(from: GeoPoint, to: GeoPoint): boolean {
    return !keepOut.some((polygon) => pathEntersPolygon([from, to], polygon))
  }

  function route(from: GeoPoint, to: GeoPoint): GeoPoint[] | null {
    if (isClear(from, to)) return []
    const nodes = [from, to, ...corners]
    const best = nodes.map(() => Number.POSITIVE_INFINITY)
    const previous = nodes.map(() => -1)
    const done = nodes.map(() => false)
    best[0] = 0
    for (;;) {
      let current = -1
      nodes.forEach((_, i) => {
        if (!done[i] && (current === -1 || (best[i] ?? Infinity) < (best[current] ?? Infinity)))
          current = i
      })
      const currentCost = best[current] ?? Infinity
      if (current === -1 || currentCost === Infinity) return null
      if (current === 1) break
      done[current] = true
      const here = nodes[current] ?? from
      nodes.forEach((node, i) => {
        if (done[i]) return
        const cost = currentCost + distanceMeters(here, node)
        if (cost < (best[i] ?? Infinity) && isClear(here, node)) {
          best[i] = cost
          previous[i] = current
        }
      })
    }
    const path: GeoPoint[] = []
    for (let i = previous[1] ?? -1; i > 0; i = previous[i] ?? -1) {
      const node = nodes[i]
      if (node) path.unshift(node)
    }
    return path
  }

  function distance(from: GeoPoint, to: GeoPoint): number {
    const path = [from, ...(route(from, to) ?? []), to]
    return path.slice(1).reduce((sum, p, i) => sum + distanceMeters(path[i] ?? p, p), 0)
  }

  return { exclusions, isClear, route, distance }
}

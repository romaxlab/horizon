import type { GeoPoint } from './geo'

/** Restricted airspace (no-fly zone). UAVs must neither be planned through nor fly into it. */
export interface Geofence {
  id: string
  name: string
  polygon: GeoPoint[]
}

/*
 * Containment and crossing tests run directly on longitude/latitude. Both are preserved by the
 * linear scaling of a local projection, so no projection is needed at operational scale.
 */

/** Ray casting; points exactly on an edge may fall either way. */
export function isPointInPolygon(point: GeoPoint, polygon: readonly GeoPoint[]): boolean {
  let inside = false
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length] ?? a
    if (
      a.latitude > point.latitude !== b.latitude > point.latitude &&
      point.longitude <
        a.longitude +
          ((point.latitude - a.latitude) / (b.latitude - a.latitude)) * (b.longitude - a.longitude)
    ) {
      inside = !inside
    }
  })
  return inside
}

function edgesOf(polygon: readonly GeoPoint[]): [GeoPoint, GeoPoint][] {
  return polygon.map((a, i) => [a, polygon[(i + 1) % polygon.length] ?? a])
}

/**
 * Where along the leg (0–1) it meets the polygon boundary: crossings, touches and vertices
 * it passes through. Between two consecutive meetings the leg is wholly inside or outside.
 */
function boundaryHits(from: GeoPoint, to: GeoPoint, polygon: readonly GeoPoint[]): number[] {
  const dx = to.longitude - from.longitude
  const dy = to.latitude - from.latitude
  const hits: number[] = []
  for (const [a, b] of edgesOf(polygon)) {
    const ex = b.longitude - a.longitude
    const ey = b.latitude - a.latitude
    const ax = a.longitude - from.longitude
    const ay = a.latitude - from.latitude
    const denominator = dx * ey - dy * ex
    if (denominator !== 0) {
      const t = (ax * ey - ay * ex) / denominator
      const u = (ax * dy - ay * dx) / denominator
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) hits.push(t)
    } else if (ax * dy - ay * dx === 0) {
      // Collinear edge: its ends on the leg bound the shared stretch.
      const length = dx * dx + dy * dy
      if (length === 0) continue
      for (const [x, y] of [
        [ax, ay],
        [b.longitude - from.longitude, b.latitude - from.latitude],
      ] as const) {
        const t = (x * dx + y * dy) / length
        if (t >= 0 && t <= 1) hits.push(t)
      }
    }
  }
  return hits
}

/** Whether a polyline enters the polygon: a vertex inside, or any part of a leg inside. */
export function pathEntersPolygon(
  path: readonly GeoPoint[],
  polygon: readonly GeoPoint[],
): boolean {
  if (path.some((point) => isPointInPolygon(point, polygon))) return true
  return path.slice(1).some((to, i) => {
    const from = path[i] ?? to
    // Test one point per stretch between boundary meetings. Unlike a crossing test, this also
    // catches a leg entering exactly through a corner, while grazing a corner from outside
    // stays clear.
    const ts = [0, ...boundaryHits(from, to, polygon), 1].sort((a, b) => a - b)
    return ts.slice(1).some((t, j) => {
      const previous = ts[j] ?? t
      // A zero-length stretch is a boundary point itself, which ray casting may place either way.
      if (t === previous) return false
      const mid = (previous + t) / 2
      return isPointInPolygon(
        {
          ...from,
          latitude: from.latitude + (to.latitude - from.latitude) * mid,
          longitude: from.longitude + (to.longitude - from.longitude) * mid,
        },
        polygon,
      )
    })
  })
}

/** Whether two polygons share any area. */
export function polygonsOverlap(a: readonly GeoPoint[], b: readonly GeoPoint[]): boolean {
  return pathEntersPolygon([...a, ...a.slice(0, 1)], b) || b.some((p) => isPointInPolygon(p, a))
}

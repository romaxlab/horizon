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

const cross = (o: GeoPoint, a: GeoPoint, b: GeoPoint) =>
  (a.longitude - o.longitude) * (b.latitude - o.latitude) -
  (a.latitude - o.latitude) * (b.longitude - o.longitude)

/** Proper crossing of segments p1–p2 and q1–q2 (touching endpoints don't count). */
function segmentsCross(p1: GeoPoint, p2: GeoPoint, q1: GeoPoint, q2: GeoPoint): boolean {
  const d1 = cross(q1, q2, p1)
  const d2 = cross(q1, q2, p2)
  const d3 = cross(p1, p2, q1)
  const d4 = cross(p1, p2, q2)
  return d1 * d2 < 0 && d3 * d4 < 0
}

function edgesOf(polygon: readonly GeoPoint[]): [GeoPoint, GeoPoint][] {
  return polygon.map((a, i) => [a, polygon[(i + 1) % polygon.length] ?? a])
}

/** Whether a polyline enters the polygon: a vertex inside or a leg crossing its boundary. */
export function pathEntersPolygon(
  path: readonly GeoPoint[],
  polygon: readonly GeoPoint[],
): boolean {
  if (path.some((point) => isPointInPolygon(point, polygon))) return true
  const edges = edgesOf(polygon)
  return path.slice(1).some((to, i) => {
    const from = path[i] ?? to
    return edges.some(([a, b]) => segmentsCross(from, to, a, b))
  })
}

/** Whether two polygons share any area. */
export function polygonsOverlap(a: readonly GeoPoint[], b: readonly GeoPoint[]): boolean {
  return pathEntersPolygon([...a, ...a.slice(0, 1)], b) || b.some((p) => isPointInPolygon(p, a))
}

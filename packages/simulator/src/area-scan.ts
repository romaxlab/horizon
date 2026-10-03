import {
  distanceMeters,
  type GeoPoint,
  type MissionArea,
  type UavRoute,
  type Waypoint,
} from '@horizon/domain'

export interface AreaScanRequest {
  area: MissionArea
  /** Scan altitude, meters. */
  altitude: number
  /** UAVs in assignment order, with the position they depart from and return to. */
  uavs: { id: string; home: GeoPoint }[]
  /** Distance between scan lines. Defaults to a camera footprint of half the altitude. */
  lineSpacingMeters?: number
  cruiseSpeedMps: number
}

export class AreaScanError extends Error {
  override name = 'AreaScanError'
}

interface Vec {
  x: number
  y: number
}

const METERS_PER_DEGREE = 111_194.93

/** Equirectangular projection around `origin`; accurate enough at mission-area scale. */
function createProjection(origin: GeoPoint) {
  const cosLat = Math.cos((origin.latitude * Math.PI) / 180)
  return {
    toLocal: (p: GeoPoint): Vec => ({
      x: (p.longitude - origin.longitude) * cosLat * METERS_PER_DEGREE,
      y: (p.latitude - origin.latitude) * METERS_PER_DEGREE,
    }),
    toGeo: (v: Vec): GeoPoint => ({
      latitude: origin.latitude + v.y / METERS_PER_DEGREE,
      longitude: origin.longitude + v.x / (cosLat * METERS_PER_DEGREE),
    }),
  }
}

/** Segments where the vertical line at `x` lies inside the polygon, bottom to top. */
function clipVerticalLine(polygon: Vec[], x: number): [number, number][] {
  const ys: number[] = []
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length] ?? a
    if (a.x <= x !== b.x <= x) ys.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y))
  })
  ys.sort((p, q) => p - q)
  const segments: [number, number][] = []
  for (let i = 0; i + 1 < ys.length; i += 2) segments.push([ys[i] ?? 0, ys[i + 1] ?? 0])
  return segments
}

function routeDistance(home: GeoPoint, waypoints: GeoPoint[]): number {
  const path = [home, ...waypoints, home]
  return path.slice(1).reduce((sum, point, i) => sum + distanceMeters(path[i] ?? point, point), 0)
}

/**
 * Deterministic boustrophedon ("lawnmower") coverage.
 * The area is split into equal-width north–south strips, one per UAV; each UAV sweeps its strip
 * line by line, alternating direction, then returns home.
 */
export function planAreaScan(request: AreaScanRequest): UavRoute[] {
  const { area, altitude, uavs, cruiseSpeedMps } = request
  const spacing = request.lineSpacingMeters ?? altitude / 2
  if (area.polygon.length < 3) throw new AreaScanError('Mission area needs at least 3 points')
  if (uavs.length === 0) throw new AreaScanError('At least one UAV is required')
  if (!(spacing > 0)) throw new AreaScanError('Line spacing must be positive')

  const origin = area.polygon[0] ?? { latitude: 0, longitude: 0 }
  const projection = createProjection(origin)
  const polygon = area.polygon.map(projection.toLocal)
  const minX = Math.min(...polygon.map((p) => p.x))
  const maxX = Math.max(...polygon.map((p) => p.x))

  const lineCount = Math.floor((maxX - minX) / spacing)
  if (lineCount < uavs.length) {
    throw new AreaScanError(`Area is too small for ${uavs.length} UAVs at ${spacing} m spacing`)
  }
  const usedWidth = lineCount * spacing
  const firstX = minX + (maxX - minX - usedWidth) / 2 + spacing / 2

  return uavs.map((uav, uavIndex) => {
    const fromLine = Math.round((uavIndex * lineCount) / uavs.length)
    const toLine = Math.round(((uavIndex + 1) * lineCount) / uavs.length)
    const points: Vec[] = []
    for (let line = fromLine; line < toLine; line++) {
      const x = firstX + line * spacing
      const upward = (line - fromLine) % 2 === 0
      const segments = clipVerticalLine(polygon, x)
      for (const [bottom, top] of upward ? segments : segments.slice().reverse()) {
        const [start, end] = upward ? [bottom, top] : [top, bottom]
        points.push({ x, y: start }, { x, y: end })
      }
    }

    const geoPoints = points.map(projection.toGeo)
    const waypoints: Waypoint[] = geoPoints.map((point, order) => ({
      id: `${uav.id}-wp-${order}`,
      ...point,
      altitude,
      order,
    }))
    const distance = routeDistance(uav.home, geoPoints)
    return {
      uavId: uav.id,
      waypoints,
      distanceMeters: Math.round(distance),
      estimatedDurationSec: Math.round(distance / cruiseSpeedMps),
    }
  })
}

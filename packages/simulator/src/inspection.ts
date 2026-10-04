import { destinationPoint, type GeoPoint } from '@horizon/domain'

export const INSPECTION_RADIUS_RANGE = { min: 30, max: 1000 } as const

/** Corners of the orbit polygon; 24 keeps the chord error below 1 % of the radius. */
const ORBIT_POINTS = 24

/**
 * Orbit around an inspection target as a closed loop, clockwise from north. Point inspection is
 * planned as a patrol of this loop, so spacing, laps and no-fly detours behave the same.
 */
export function orbitLoop(target: GeoPoint, radiusMeters: number): GeoPoint[] {
  return Array.from({ length: ORBIT_POINTS }, (_, i) =>
    destinationPoint(target, (i * 360) / ORBIT_POINTS, radiusMeters),
  )
}

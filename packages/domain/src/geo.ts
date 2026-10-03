export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface GeoPosition extends GeoPoint {
  /** Meters above ground level (AGL) at the operating site. */
  altitude: number
}

/** Mean Earth radius, meters. Spherical model; sufficient for operational distances. */
export const EARTH_RADIUS_METERS = 6_371_000

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const toDegrees = (radians: number) => (radians * 180) / Math.PI

/** Great-circle distance in meters. */
export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.latitude - from.latitude)
  const dLon = toRadians(to.longitude - from.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Initial bearing in degrees clockwise from true north, 0–360. */
export function bearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const dLon = toRadians(to.longitude - from.longitude)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

/** Point reached by travelling `meters` from `from` along `bearing` degrees. */
export function destinationPoint(from: GeoPoint, bearing: number, meters: number): GeoPoint {
  const angular = meters / EARTH_RADIUS_METERS
  const theta = toRadians(bearing)
  const lat1 = toRadians(from.latitude)
  const lon1 = toRadians(from.longitude)
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta),
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    )
  return { latitude: toDegrees(lat2), longitude: ((toDegrees(lon2) + 540) % 360) - 180 }
}

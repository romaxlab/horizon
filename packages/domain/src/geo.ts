export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface GeoPosition extends GeoPoint {
  /** Meters above the ellipsoid. */
  altitude: number
}

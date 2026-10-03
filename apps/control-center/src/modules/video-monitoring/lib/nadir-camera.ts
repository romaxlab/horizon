/** Web Mercator tile size in pixels. */
export const TILE_SIZE = 256
const EARTH_CIRCUMFERENCE_PER_PIXEL = 156_543.033_928
/** Horizontal field of view of the simulated camera. */
export const CAMERA_FOV_DEGREES = 70
/** The gimbal never gets closer than this to the ground (e.g. parked UAVs). */
export const MIN_CAMERA_HEIGHT_METERS = 25

/** Global pixel position at zoom `z` (Web Mercator). */
export function worldPixel(latitude: number, longitude: number, z: number) {
  const scale = TILE_SIZE * 2 ** z
  const sin = Math.sin((latitude * Math.PI) / 180)
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

export interface NadirView {
  z: number
  /** Canvas pixels per world pixel at zoom `z`. */
  scale: number
  /** Ground width covered by the frame, meters. */
  groundWidthMeters: number
}

/**
 * Tile zoom and scale for a downward-looking camera at `altitude` filling `widthPx` canvas
 * pixels: ground width = 2·h·tan(FOV/2); the zoom is the coarsest that still has enough detail.
 */
export function nadirView(
  latitude: number,
  altitude: number,
  widthPx: number,
  maxZoom: number,
): NadirView {
  const height = Math.max(altitude, MIN_CAMERA_HEIGHT_METERS)
  const groundWidthMeters = 2 * height * Math.tan(((CAMERA_FOV_DEGREES / 2) * Math.PI) / 180)
  const metersPerCanvasPx = groundWidthMeters / widthPx
  const metersPerPxAtZ0 = EARTH_CIRCUMFERENCE_PER_PIXEL * Math.cos((latitude * Math.PI) / 180)
  const z = Math.min(
    maxZoom,
    Math.max(0, Math.ceil(Math.log2(metersPerPxAtZ0 / metersPerCanvasPx))),
  )
  const metersPerWorldPx = metersPerPxAtZ0 / 2 ** z
  return { z, scale: metersPerWorldPx / metersPerCanvasPx, groundWidthMeters }
}

/** Tiles covering a circle of `radiusPx` canvas pixels around the camera center. */
export function visibleTiles(
  center: { x: number; y: number },
  z: number,
  scale: number,
  radiusPx: number,
) {
  const radiusWorld = radiusPx / scale
  const max = 2 ** z - 1
  const tiles: { x: number; y: number }[] = []
  const x0 = Math.max(0, Math.floor((center.x - radiusWorld) / TILE_SIZE))
  const x1 = Math.min(max, Math.floor((center.x + radiusWorld) / TILE_SIZE))
  const y0 = Math.max(0, Math.floor((center.y - radiusWorld) / TILE_SIZE))
  const y1 = Math.min(max, Math.floor((center.y + radiusWorld) / TILE_SIZE))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ x, y })
  return tiles
}

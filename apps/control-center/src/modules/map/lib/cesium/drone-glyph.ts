import droneSvg from '../../assets/drone.svg?raw'

/** Size of the source SVG's viewBox; the glyph is authored nose-up (north) and centered. */
export const DRONE_VIEWBOX = 512

let glyph: Path2D | null = null

/**
 * Outline of the drone marker, built from the SVG asset (`assets/drone.svg`) so the artwork stays
 * the single source of truth. Coordinates are in viewBox units.
 */
export function getDroneGlyph(): Path2D {
  if (glyph) return glyph
  const doc = new DOMParser().parseFromString(droneSvg, 'image/svg+xml')
  const path = new Path2D()
  doc.querySelectorAll('polygon').forEach((polygon) => {
    const values = (polygon.getAttribute('points') ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    for (let i = 0; i + 1 < values.length; i += 2) {
      const x = values[i] ?? 0
      const y = values[i + 1] ?? 0
      if (i === 0) path.moveTo(x, y)
      else path.lineTo(x, y)
    }
    path.closePath()
  })
  doc.querySelectorAll('path').forEach((element) => {
    path.addPath(new Path2D(element.getAttribute('d') ?? ''))
  })
  glyph = path
  return glyph
}

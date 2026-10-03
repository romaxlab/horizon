import type { Color } from 'cesium'
import { DRONE_VIEWBOX, getDroneGlyph } from './drone-glyph'

/**
 * Map overlay images, drawn on canvases at 3× their on-screen size so they stay crisp on
 * high-DPI displays. All colors come from the theme palette.
 */
export const IMAGE_SCALE = 3
const FONT = '-apple-system, BlinkMacSystemFont, "Inter Variable", sans-serif'
const cache = new Map<string, HTMLCanvasElement>()

function cached(
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * IMAGE_SCALE)
  canvas.height = Math.ceil(height * IMAGE_SCALE)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(IMAGE_SCALE, IMAGE_SCALE)
    draw(ctx)
  }
  cache.set(key, canvas)
  return canvas
}

const css = (color: Color) => color.toCssColorString()

/** On-screen size of a UAV marker image (CSS px), leaving room for the selection ring. */
export const MARKER_SIZE = 32
const CENTER = MARKER_SIZE / 2
/** On-screen size of the drone glyph itself (CSS px). */
const GLYPH_SIZE = 20
const FOCUS_RADIUS = 14.5
/** Halo stroke around the glyph (CSS px, outside the shape). */
const HALO_WIDTH = 1.5

export interface MarkerColors {
  fill: Color
  halo: Color
  shadow: Color
  /** Focus ring for the selected state. */
  focus?: Color
}

/**
 * Top-down drone marker from `assets/drone.svg`: status-colored glyph with a white halo and soft
 * shadow so it reads on gray map and satellite imagery. Points north at zero rotation; the
 * anchor is the glyph center.
 */
export function getUavMarker({ fill, halo, shadow, focus }: MarkerColors): HTMLCanvasElement {
  const key = `uav|${css(fill)}|${css(halo)}|${css(shadow)}|${focus ? css(focus) : ''}`
  return cached(key, MARKER_SIZE, MARKER_SIZE, (ctx) => {
    if (focus) {
      ctx.beginPath()
      ctx.arc(CENTER, CENTER, FOCUS_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = css(focus.withAlpha(0.16))
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = css(focus.withAlpha(0.6))
      ctx.stroke()
    }

    const glyph = getDroneGlyph()
    const unit = GLYPH_SIZE / DRONE_VIEWBOX
    ctx.save()
    ctx.translate(CENTER - GLYPH_SIZE / 2, CENTER - GLYPH_SIZE / 2)
    ctx.scale(unit, unit)
    ctx.lineJoin = 'round'

    // Halo pass with a soft shadow: the stroke straddles the outline, so double it.
    ctx.save()
    ctx.shadowColor = css(shadow)
    ctx.shadowBlur = 3 * IMAGE_SCALE
    ctx.shadowOffsetY = 0.5 * IMAGE_SCALE
    ctx.lineWidth = (HALO_WIDTH * 2) / unit
    ctx.strokeStyle = css(halo)
    ctx.stroke(glyph)
    ctx.restore()

    ctx.fillStyle = css(fill)
    ctx.fill(glyph)
    ctx.restore()
  })
}

export interface BadgeColors {
  surface: Color
  text: Color
  halo: Color
  shadow: Color
  /** Ring for clusters containing warning/offline UAVs; omitted for nominal clusters. */
  alert?: Color
}

export function clusterBadgeSize(count: number): number {
  return count < 10 ? 28 : 32
}

/** Minimal round cluster badge with the member count. */
export function getClusterBadge(count: number, colors: BadgeColors): HTMLCanvasElement {
  const { surface, text, halo, shadow, alert } = colors
  const size = clusterBadgeSize(count)
  const key = `cluster|${count}|${css(surface)}|${css(text)}|${css(halo)}|${alert ? css(alert) : ''}`
  return cached(key, size, size, (ctx) => {
    const c = size / 2
    const r = c - 2.5
    ctx.save()
    ctx.shadowColor = css(shadow)
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 1
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.fillStyle = css(surface)
    ctx.fill()
    ctx.restore()

    ctx.lineWidth = alert ? 2 : 1
    ctx.strokeStyle = css(alert ?? halo.withAlpha(0.6))
    ctx.beginPath()
    ctx.arc(c, c, r - (alert ? 1 : 0.5), 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = css(text)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 12px ${FONT}`
    ctx.fillText(String(count), c, c + 0.5)
  })
}

export interface LabelColors {
  surface: Color
  text: Color
  shadow: Color
}

/** Compact pill label (e.g. the selected UAV's name). Returns the canvas and its CSS size. */
export function getLabelPill(
  text: string,
  { surface, text: textColor, shadow }: LabelColors,
): { image: HTMLCanvasElement; width: number; height: number } {
  const font = `600 11px ${FONT}`
  const measure = document.createElement('canvas').getContext('2d')
  if (measure) measure.font = font
  const textWidth = Math.ceil(measure?.measureText(text).width ?? text.length * 7)
  const width = textWidth + 16 + 4
  const height = 20 + 4
  const image = cached(`label|${text}|${css(surface)}|${css(textColor)}`, width, height, (ctx) => {
    ctx.save()
    ctx.shadowColor = css(shadow)
    ctx.shadowBlur = 3
    ctx.shadowOffsetY = 0.5
    ctx.beginPath()
    ctx.roundRect(2, 2, width - 4, height - 4, (height - 4) / 2)
    ctx.fillStyle = css(surface.withAlpha(0.95))
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = css(textColor)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = font
    ctx.fillText(text, width / 2, height / 2 + 0.5)
  })
  return { image, width, height }
}

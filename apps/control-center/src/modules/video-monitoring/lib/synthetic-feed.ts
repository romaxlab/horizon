import type { FeedPose, VideoSource } from '../model/video.types'
import { createPoseTrack, RENDER_DELAY_MS, type Pose } from '@/shared/lib/pose-track'
import { nadirView, TILE_SIZE, visibleTiles, worldPixel } from './nadir-camera'

/** Gentle handheld-like drift: amplitude in canvas px and degrees, slow periods. */
const DRIFT_PX = 1.6
const DRIFT_DEGREES = 0.35
const MAX_TILE_CACHE = 160

export interface SyntheticFeed {
  setPose(pose: FeedPose): void
  /** Frozen feeds keep the last frame (link stale). */
  setFrozen(frozen: boolean): void
  /** Resolves once the first frame with imagery has been drawn. */
  readonly ready: Promise<void>
  destroy(): void
}

/**
 * Simulated onboard camera: a nadir view of satellite tiles under the UAV, rotated so the
 * heading points up. Draws on a canvas at device resolution; no third-party dependencies.
 */
export function createSyntheticFeed(canvas: HTMLCanvasElement, source: VideoSource): SyntheticFeed {
  const ctx = canvas.getContext('2d')
  const tiles = new Map<string, HTMLImageElement>()
  // Telemetry only sets targets; the camera is interpolated every frame (incl. heading across 0/360).
  const track = createPoseTrack()
  let lastTimestamp = -Infinity
  let backdrop = ''
  let frozen = false
  let frame = 0
  let destroyed = false
  let resolveReady: () => void = () => undefined
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function tile(z: number, x: number, y: number): HTMLImageElement {
    const key = `${z}/${x}/${y}`
    const cached = tiles.get(key)
    if (cached) {
      // Refresh LRU position.
      tiles.delete(key)
      tiles.set(key, cached)
      return cached
    }
    const image = new Image()
    image.decoding = 'async'
    image.src = source.tileUrlTemplate
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y))
    tiles.set(key, image)
    if (tiles.size > MAX_TILE_CACHE) {
      const oldest = tiles.keys().next().value
      if (oldest !== undefined) tiles.delete(oldest)
    }
    return image
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.round(canvas.clientWidth * dpr)
    const height = Math.round(canvas.clientHeight * dpr)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }

  function draw(time: number, current: Pose) {
    if (!ctx) return
    resize()
    const { width, height } = canvas
    const view = nadirView(current.latitude, current.altitude, width, source.maxZoom)
    const center = worldPixel(current.latitude, current.longitude, view.z)
    const drift = reducedMotion
      ? { x: 0, y: 0, r: 0 }
      : {
          x: Math.sin(time / 1700) * DRIFT_PX + Math.sin(time / 610) * DRIFT_PX * 0.35,
          y: Math.cos(time / 2100) * DRIFT_PX + Math.sin(time / 730) * DRIFT_PX * 0.35,
          r: Math.sin(time / 2900) * DRIFT_DEGREES,
        }

    ctx.save()
    backdrop ||= getComputedStyle(canvas).backgroundColor
    ctx.fillStyle = backdrop
    ctx.fillRect(0, 0, width, height)
    ctx.translate(width / 2 + drift.x, height / 2 + drift.y)
    ctx.rotate((-(current.heading + drift.r) * Math.PI) / 180)
    ctx.scale(view.scale, view.scale)
    ctx.imageSmoothingQuality = 'high'

    let drawn = 0
    for (const { x, y } of visibleTiles(
      center,
      view.z,
      view.scale,
      Math.hypot(width, height) / 2,
    )) {
      const image = tile(view.z, x, y)
      if (!image.complete || image.naturalWidth === 0) continue
      // +0.5 world px overlap hides hairline seams between tiles when scaled.
      ctx.drawImage(
        image,
        x * TILE_SIZE - center.x,
        y * TILE_SIZE - center.y,
        TILE_SIZE + 0.5,
        TILE_SIZE + 0.5,
      )
      drawn += 1
    }
    ctx.restore()
    if (drawn > 0) resolveReady()
  }

  function loop(time: number) {
    if (destroyed) return
    if (!frozen) {
      const pose = track.sampleAt(Date.now() - RENDER_DELAY_MS)
      if (pose) draw(time, pose)
    }
    frame = requestAnimationFrame(loop)
  }
  frame = requestAnimationFrame(loop)

  return {
    setPose(pose) {
      if (pose.timestamp <= lastTimestamp) return
      lastTimestamp = pose.timestamp
      track.push(pose.timestamp, pose.receivedAt, pose)
    },
    setFrozen(next) {
      frozen = next
    },
    ready,
    destroy() {
      destroyed = true
      cancelAnimationFrame(frame)
      tiles.clear()
    },
  }
}

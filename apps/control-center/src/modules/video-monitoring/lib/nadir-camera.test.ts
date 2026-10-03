import { describe, expect, it } from 'vitest'
import { nadirView, visibleTiles, worldPixel } from './nadir-camera'

describe('nadir camera', () => {
  it('projects to Web Mercator tile pixels', () => {
    const p = worldPixel(24.453, 54.38, 15)
    // Matches the tile used for the Abu Dhabi base (x 21333.79, y 14087.42 at z15).
    expect(p.x / 256).toBeCloseTo(21333.79, 1)
    expect(p.y / 256).toBeCloseTo(14087.42, 1)
  })

  it('covers 2·h·tan(35°) of ground and picks enough tile detail', () => {
    const view = nadirView(24.45, 120, 640, 19)
    expect(view.groundWidthMeters).toBeCloseTo(168, 0)
    expect(view.z).toBe(19)
    // Higher altitude → wider view → coarser tiles.
    expect(nadirView(24.45, 600, 640, 19).z).toBeLessThan(19)
    // Parked UAVs still see a sensible ground footprint.
    expect(nadirView(24.45, 0, 640, 19).groundWidthMeters).toBeCloseTo(35, 0)
  })

  it('upscales tiles rather than exceeding the max zoom', () => {
    expect(nadirView(24.45, 25, 640, 17)).toMatchObject({ z: 17 })
    expect(nadirView(24.45, 25, 640, 17).scale).toBeGreaterThan(1)
  })

  it('lists the tiles around the camera', () => {
    const tiles = visibleTiles({ x: 1000, y: 1000 }, 4, 1, 300)
    expect(tiles).toContainEqual({ x: 3, y: 3 })
    expect(tiles.every((t) => t.x >= 2 && t.x <= 5 && t.y >= 2 && t.y <= 5)).toBe(true)
  })
})

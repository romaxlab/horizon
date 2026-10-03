import { distanceMeters, pathEntersPolygon } from '@horizon/domain'
import { describe, expect, it } from 'vitest'
import { createAirspaceRouter } from '../airspace-routing'

const p = (latitude: number, longitude: number) => ({ latitude, longitude })
// ≈ 550 × 550 m square zone.
const zone = {
  id: 'z',
  name: 'Zone',
  polygon: [p(24.45, 54.36), p(24.455, 54.36), p(24.455, 54.3655), p(24.45, 54.3655)],
}

describe('createAirspaceRouter', () => {
  const router = createAirspaceRouter([zone])

  it('keeps clear legs straight', () => {
    expect(router.route(p(24.44, 54.35), p(24.44, 54.38))).toEqual([])
  })

  it('detours around a zone on a short path that stays out of it', () => {
    const from = p(24.4525, 54.35)
    const to = p(24.4525, 54.375)
    const detour = router.route(from, to)
    expect(detour?.length).toBeGreaterThan(0)
    const path = [from, ...(detour ?? []), to]
    expect(pathEntersPolygon(path, zone.polygon)).toBe(false)
    // Around one side of the zone, not a wide loop.
    expect(router.distance(from, to)).toBeLessThan(distanceMeters(from, to) * 1.3)
  })

  it('has no clear path out of a zone', () => {
    expect(router.route(p(24.4525, 54.3627), p(24.44, 54.35))).toBeNull()
  })
})

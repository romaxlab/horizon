import { distanceMeters } from '@horizon/domain'
import { describe, expect, it } from 'vitest'
import { orbitLoop } from '../inspection'

describe('orbitLoop', () => {
  it('places evenly spaced points on a circle around the target', () => {
    const target = { latitude: 24.46, longitude: 54.37 }
    const loop = orbitLoop(target, 200)
    expect(loop).toHaveLength(24)
    for (const point of loop) expect(distanceMeters(target, point)).toBeCloseTo(200, 0)
    // North first, then clockwise (east next).
    expect(loop[0]?.latitude).toBeGreaterThan(target.latitude)
    expect(loop[6]?.longitude).toBeGreaterThan(target.longitude)
  })
})

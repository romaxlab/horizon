import { distanceMeters, pathEntersPolygon } from '@horizon/domain'
import { describe, expect, it } from 'vitest'
import { createAirspaceRouter } from '../airspace-routing'
import { planPatrol } from '../patrol'

const p = (latitude: number, longitude: number) => ({ latitude, longitude })
// ≈ 1 × 1 km square loop, flown counter-clockwise from the south-west corner.
const loop = [p(24.46, 54.36), p(24.46, 54.37), p(24.469, 54.37), p(24.469, 54.36)]
const home = p(24.45, 54.39)
const request = {
  loop,
  altitude: 100,
  laps: 2,
  uavs: [
    { id: 'a', home },
    { id: 'b', home },
  ],
  cruiseSpeedMps: 14,
}
const geo = (w: { latitude: number; longitude: number }) => p(w.latitude, w.longitude)

describe('planPatrol', () => {
  it('spaces UAVs evenly along the loop and ends each route where it started', () => {
    const [a, b] = planPatrol(request).map((route) => route.waypoints.map(geo))
    if (!a || !b) throw new Error('missing routes')
    expect(a[0]).toEqual(loop[0])
    // Half of the ≈ 4 km loop away: the opposite corner.
    expect(distanceMeters(b[0] ?? home, p(24.469, 54.37))).toBeLessThan(1)
    expect(a.at(-1)).toEqual(a[0])
    expect(b.at(-1)).toEqual(b[0])
  })

  it('flies every corner once per lap', () => {
    const [route] = planPatrol({ ...request, laps: 3 })
    const corner = loop[2] ?? home
    const visits = route?.waypoints.filter((w) => distanceMeters(geo(w), corner) < 1).length
    expect(visits).toBe(3)
  })

  it('detours loop legs around a no-fly zone between corners', () => {
    // Zone on the southern edge of the loop.
    const zone = {
      id: 'z',
      name: 'Zone',
      polygon: [p(24.459, 54.364), p(24.461, 54.364), p(24.461, 54.366), p(24.459, 54.366)],
    }
    const [route] = planPatrol({ ...request, laps: 1, airspace: createAirspaceRouter([zone]) })
    const path = [home, ...(route?.waypoints.map(geo) ?? [])]
    expect(pathEntersPolygon(path, zone.polygon)).toBe(false)
  })

  it('rejects routes it cannot fly', () => {
    expect(() => planPatrol({ ...request, loop: loop.slice(0, 2) })).toThrow('at least 3 points')
    expect(() => planPatrol({ ...request, laps: 0 })).toThrow('Laps')
  })
})

import { distanceMeters } from '@horizon/domain'
import { describe, expect, it } from 'vitest'
import { AreaScanError, planAreaScan, type AreaScanRequest } from '../area-scan'
import { DEMO_BASE, DEMO_MISSION } from '../demo'

const uavs = Array.from({ length: 6 }, (_, i) => ({ id: `uav-0${i + 1}`, home: DEMO_BASE }))

const request: AreaScanRequest = {
  area: { polygon: [...DEMO_MISSION.area.polygon] },
  altitude: 120,
  uavs,
  cruiseSpeedMps: 14,
}

describe('planAreaScan', () => {
  it('assigns one non-empty route per UAV at the scan altitude', () => {
    const routes = planAreaScan(request)

    expect(routes.map((r) => r.uavId)).toEqual(uavs.map((u) => u.id))
    for (const route of routes) {
      expect(route.waypoints.length).toBeGreaterThanOrEqual(2)
      expect(route.waypoints.every((w) => w.altitude === 120)).toBe(true)
      expect(route.waypoints.map((w) => w.order)).toEqual(route.waypoints.map((_, i) => i))
      expect(route.estimatedDurationSec).toBe(Math.round(route.distanceMeters / 14))
    }
  })

  it('is deterministic', () => {
    expect(planAreaScan(request)).toEqual(planAreaScan(request))
  })

  it('keeps waypoints within the area bounds', () => {
    const lats = request.area.polygon.map((p) => p.latitude)
    const lons = request.area.polygon.map((p) => p.longitude)
    const waypoints = planAreaScan(request).flatMap((r) => r.waypoints)

    for (const w of waypoints) {
      expect(w.latitude).toBeGreaterThanOrEqual(Math.min(...lats) - 1e-9)
      expect(w.latitude).toBeLessThanOrEqual(Math.max(...lats) + 1e-9)
      expect(w.longitude).toBeGreaterThanOrEqual(Math.min(...lons) - 1e-9)
      expect(w.longitude).toBeLessThanOrEqual(Math.max(...lons) + 1e-9)
    }
  })

  it('sweeps lines at the requested spacing in alternating directions', () => {
    const [route] = planAreaScan({ ...request, uavs: uavs.slice(0, 1), lineSpacingMeters: 100 })
    const [a, b, c, d] = route?.waypoints ?? []
    if (!a || !b || !c || !d) throw new Error('expected at least two scan lines')

    expect(a.longitude).toBeCloseTo(b.longitude, 9)
    expect(b.latitude).toBeGreaterThan(a.latitude)
    expect(d.latitude).toBeLessThan(c.latitude)
    expect(distanceMeters(b, { latitude: b.latitude, longitude: c.longitude })).toBeCloseTo(100, 0)
  })

  it('rejects invalid requests', () => {
    expect(() => planAreaScan({ ...request, area: { polygon: [] } })).toThrow(AreaScanError)
    expect(() => planAreaScan({ ...request, uavs: [] })).toThrow(AreaScanError)
    expect(() => planAreaScan({ ...request, lineSpacingMeters: 5_000 })).toThrow(AreaScanError)
  })
})

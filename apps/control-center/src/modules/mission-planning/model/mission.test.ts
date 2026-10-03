import type { Mission, UavTelemetry } from '@horizon/domain'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseMission, parseMissionMessage } from '../api/mission.parsers'
import { computeMissionProgress } from './mission-progress'
import { useMissionStore } from './mission.store'

const missionDto = {
  id: 'm-1',
  name: 'Scan',
  type: 'area_scan',
  status: 'active',
  area: {
    polygon: [
      { lat: 24.46, lon: 54.36 },
      { lat: 24.47, lon: 54.36 },
      { lat: 24.47, lon: 54.37 },
    ],
  },
  altitude_m: 120,
  assigned_uav_ids: ['a', 'b'],
  routes: ['a', 'b'].map((uavId, r) => ({
    uav_id: uavId,
    waypoints: [0, 1, 2, 3].map((order) => ({
      id: `${uavId}-${order}`,
      lat: 24.46 + order * 0.001,
      lon: 54.36 + r * 0.001,
      alt_m: 120,
      order,
    })),
    distance_m: 1_400,
    eta_s: 100,
  })),
  created_at: 1,
  started_at: 2,
  completed_at: null,
}

const telemetry = (uavId: string, overrides: Partial<UavTelemetry>): UavTelemetry => ({
  uavId,
  timestamp: 0,
  position: { latitude: 24.46, longitude: 54.36, altitude: 120 },
  speed: 14,
  heading: 0,
  battery: 80,
  signal: 90,
  gpsSatellites: 12,
  missionId: 'm-1',
  currentWaypoint: 0,
  ...overrides,
})

describe('mission parsing', () => {
  it('maps the DTO to the domain model', () => {
    const mission = parseMission(missionDto)
    expect(mission).toMatchObject({ id: 'm-1', status: 'active', altitude: 120, startedAt: 2 })
    expect(mission.area.polygon[0]).toEqual({ latitude: 24.46, longitude: 54.36 })
    expect(mission.routes[1]?.waypoints[2]).toMatchObject({ id: 'b-2', order: 2, altitude: 120 })
  })

  it('rejects invalid payloads and ignores other message types', () => {
    expect(() => parseMission({ ...missionDto, area: { polygon: [] } })).toThrow()
    expect(parseMissionMessage({ type: 'telemetry', data: {} })).toBeNull()
    expect(parseMissionMessage({ type: 'mission', data: missionDto })?.id).toBe('m-1')
  })
})

describe('computeMissionProgress', () => {
  const mission = parseMission(missionDto)

  it('derives progress from waypoints reached on each route', () => {
    const progress = computeMissionProgress(
      mission,
      new Map([
        ['a', telemetry('a', { currentWaypoint: 2 })],
        ['b', telemetry('b', { currentWaypoint: 1 })],
      ]),
    )
    expect(progress).toMatchObject({ completedWaypoints: 3, totalWaypoints: 8, activeUavCount: 2 })
    expect(progress.ratio).toBeCloseTo(3 / 8)
    expect(progress.etaSec).toBeGreaterThan(0)
  })

  it('counts finished routes and stops the ETA when complete', () => {
    const progress = computeMissionProgress(
      { ...mission, status: 'completed' } satisfies Mission,
      new Map(),
    )
    expect(progress).toMatchObject({ ratio: 1, activeUavCount: 0, etaSec: null })
  })

  it('ignores telemetry from other missions', () => {
    const progress = computeMissionProgress(
      mission,
      new Map([['a', telemetry('a', { missionId: 'other', currentWaypoint: 3 })]]),
    )
    expect(progress.completedWaypoints).toBe(0)
  })
})

describe('useMissionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('never moves a mission back to an earlier status', () => {
    const store = useMissionStore()
    const mission = parseMission(missionDto)
    store.apply({ ...mission, status: 'completed' })
    store.apply(mission)
    expect(store.current?.status).toBe('completed')
    store.apply({ ...mission, id: 'm-2', status: 'active' })
    expect(store.current?.id).toBe('m-2')
  })
})

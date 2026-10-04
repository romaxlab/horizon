import type { Mission, UavTelemetry } from '@horizon/domain'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { parseMission, parseMissionMessage } from '../../api/mission.parsers'
import { computeMissionProgress, uavMissionStatus } from '../mission-progress'
import { useMissionStore } from '../mission.store'

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
  flightPhase: 'mission',
  returnReason: null,
  landingBattery: null,
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
  // One route: base → 4 waypoints 1 km north of each other → base. Path: 4 + 3 + 4 = 11 km.
  const KM = 1 / 111.19
  const home = { latitude: 24.46, longitude: 54.36 }
  const north = (km: number) => ({ latitude: home.latitude + km * KM, longitude: home.longitude })
  const route: Mission['routes'][number] = {
    uavId: 'a',
    home,
    waypoints: [1, 2, 3, 4].map((km, order) => ({
      id: `a-${String(order)}`,
      ...north(km),
      altitude: 120,
      order,
    })),
    taskStart: 0,
    taskEnd: 3,
    lapSize: null,
    distanceMeters: 8_000,
    estimatedDurationSec: 800,
  }
  const mission: Mission = { ...parseMission(missionDto), routes: [route], startedAt: 100 }
  const progressAt = (overrides: Partial<UavTelemetry>, status: Mission['status'] = 'active') =>
    computeMissionProgress(
      { ...mission, status },
      new Map([['a', telemetry('a', { timestamp: 200, ...overrides })]]),
    )

  it('starts moving with take-off: transit to the first waypoint counts', () => {
    const transit = progressAt({ currentWaypoint: 0, position: { ...north(0.5), altitude: 60 } })
    expect(transit.ratio).toBeCloseTo(0.5 / 8, 2)
    expect(transit.activeUavCount).toBe(1)
    // ETA covers the rest of the flight including the way home: 7.5 km at 10 m/s.
    expect(transit.etaSec).toBeCloseTo(750, -1)
  })

  it('follows the route between waypoints', () => {
    const mid = progressAt({ currentWaypoint: 2, position: { ...north(2.5), altitude: 120 } })
    expect(mid.ratio).toBeCloseTo(2.5 / 8, 2)
    expect(mid.completedWaypoints).toBe(2)
  })

  it('counts the way home and reaches 100% only after landing', () => {
    const returning = progressAt({
      currentWaypoint: 4,
      flightPhase: 'returning',
      position: { ...north(2), altitude: 140 },
    })
    expect(returning.ratio).toBeCloseTo(6 / 8, 2)
    expect(returning.returningUavCount).toBe(1)

    const landed = progressAt({ missionId: null, flightPhase: 'parked', currentWaypoint: null })
    expect(landed.ratio).toBe(1)
    expect(progressAt({}, 'completed')).toMatchObject({ ratio: 1, etaSec: null })
  })

  it('never jumps back when the UAV drifts off its leg', () => {
    const drifted = progressAt({ currentWaypoint: 2, position: { ...north(0), altitude: 120 } })
    // Still credited with the waypoints passed (base → 2nd waypoint = 2 km).
    expect(drifted.ratio).toBeCloseTo(2 / 8, 2)
  })

  it('tells transit, task and lap apart from the task span', () => {
    // Patrol-like route: one transit point, then the start point and 2 laps of 3 waypoints.
    const patrolRoute = { ...route, taskStart: 1, taskEnd: 7, lapSize: 3 }
    const waypoints = Array.from({ length: 8 }, (_, order) => ({
      id: `p-${String(order)}`,
      ...north(order + 1),
      altitude: 120,
      order,
    }))
    const patrol: Mission = { ...mission, type: 'patrol', laps: 2 }
    const at = (currentWaypoint: number) =>
      uavMissionStatus(
        patrol,
        { ...patrolRoute, waypoints },
        telemetry('a', { timestamp: 200, currentWaypoint }),
      )
    expect(at(1)).toMatchObject({ phase: 'en_route', lap: null })
    expect(at(2)).toMatchObject({ phase: 'on_task', lap: { current: 1, total: 2 } })
    expect(at(5)).toMatchObject({ phase: 'on_task', lap: { current: 2, total: 2 } })
    expect(at(7)).toMatchObject({ lap: { current: 2, total: 2 } })
  })

  it('reports why a UAV returns and what is left before launch', () => {
    expect(
      progressAt({ flightPhase: 'returning', returnReason: 'low-battery', currentWaypoint: 2 })
        .uavs[0],
    ).toMatchObject({ phase: 'returning', returnReason: 'low-battery' })
    expect(
      progressAt({ missionId: null, flightPhase: 'parked', timestamp: 50 }).uavs[0],
    ).toMatchObject({ phase: 'pending', etaSec: null })
  })

  it('ignores telemetry from before the launch and from other missions', () => {
    expect(progressAt({ missionId: null, flightPhase: 'parked', timestamp: 50 }).ratio).toBe(0)
    expect(progressAt({ missionId: 'other', currentWaypoint: 3, timestamp: 50 }).ratio).toBe(0)
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

  it('takes the backend view after a reconnect: a mission finished during an outage', () => {
    const store = useMissionStore()
    const mission = parseMission(missionDto)
    store.apply(mission)
    // The completion event was missed while disconnected; the reload carries it.
    store.replace({ ...mission, status: 'completed' })
    expect(store.current?.status).toBe('completed')
    // A backend reset has no current mission any more.
    store.replace(null)
    expect(store.current).toBeNull()
  })
})

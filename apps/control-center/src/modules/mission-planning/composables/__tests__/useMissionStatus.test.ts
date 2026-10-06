import type { Mission, UavTelemetry } from '@horizon/domain'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'
import { missionPlannerSlot } from '../../model/mission.types'
import { useMissionStore } from '../../store/mission.store'
import type { MissionPlanner } from '../../model/mission.types'
import { useMissionStatus } from '../useMissionStatus'

const home = { latitude: 24.46, longitude: 54.36 }
const north = (km: number) => ({ latitude: home.latitude + km / 111.19, longitude: home.longitude })

// Patrol of 2 laps × 2 waypoints after the start point, for two UAVs.
const route = (uavId: string): Mission['routes'][number] => ({
  uavId,
  home,
  waypoints: [1, 2, 3, 2, 3].map((km, order) => ({
    id: `${uavId}-${String(order)}`,
    ...north(km),
    altitude: 120,
    order,
  })),
  taskStart: 0,
  taskEnd: 4,
  lapSize: 2,
  distanceMeters: 8_000,
  estimatedDurationSec: 800,
})

const mission: Mission = {
  id: 'm-1',
  name: 'Perimeter',
  type: 'patrol',
  status: 'active',
  area: { polygon: [] },
  altitude: 120,
  laps: 2,
  target: null,
  radiusMeters: null,
  assignedUavIds: ['a', 'b'],
  routes: [route('a'), route('b')],
  createdAt: 0,
  startedAt: 100,
  completedAt: null,
}

const telemetry = (uavId: string, overrides: Partial<UavTelemetry>): UavTelemetry => ({
  uavId,
  timestamp: 200,
  position: { ...north(1.5), altitude: 120 },
  speed: 14,
  heading: 0,
  battery: 70,
  signal: 90,
  gpsSatellites: 12,
  missionId: 'm-1',
  currentWaypoint: 2,
  flightPhase: 'mission',
  returnReason: null,
  landingBattery: 40,
  ...overrides,
})

function setup(byUav: Record<string, UavTelemetry>) {
  setActivePinia(createPinia())
  const abort = vi.fn(() => Promise.resolve())
  const app = createApp({})
  app.use(VueQueryPlugin, { queryClient: new QueryClient() })
  const unused = () => Promise.reject(new Error('not used in this test'))
  const missionPlanner: MissionPlanner = {
    plan: unused,
    launch: unused,
    abort,
    getActiveMission: unused,
  }
  missionPlannerSlot.provide(app, missionPlanner)
  useMissionStore().apply(mission)
  const status = app.runWithContext(() =>
    useMissionStatus({
      telemetryOf: (id) => byUav[id] ?? null,
      uavNameOf: (id) => id.toUpperCase(),
      standbyCount: ref(18),
      lowBatteryPct: 20,
    }),
  )
  return { status, abort }
}

describe('useMissionStatus', () => {
  it('summarizes phases, counting a low-battery return apart in warning tone', () => {
    const { status } = setup({
      a: telemetry('a', {}),
      b: telemetry('b', {
        flightPhase: 'returning',
        returnReason: 'low-battery',
        landingBattery: 9,
      }),
    })
    expect(status.summary.value).toMatchObject({ title: 'Perimeter' })
    expect(status.summary.value.phases).toEqual([
      { text: '1 patrolling', tone: 'muted' },
      { text: '1 low battery', tone: 'warning' },
      expect.objectContaining({ text: expect.stringMatching(/^ETA /) as unknown }),
    ])
    expect(status.tasking.value).toBe(true)
  })

  it('words each UAV for the inspector: lap, ETA and battery on landing', () => {
    const { status } = setup({
      a: telemetry('a', {}),
      b: telemetry('b', {
        flightPhase: 'returning',
        returnReason: 'low-battery',
        landingBattery: 9,
      }),
    })
    const [a, b] = status.uavRows.value
    expect(a).toMatchObject({
      uavName: 'A',
      phase: 'Patrolling · lap 1 of 2',
      tone: 'secondary',
      landingBattery: { label: '≈ 40%', tone: 'secondary' },
    })
    expect(a?.eta).toMatch(/^Lands in /)
    expect(b).toMatchObject({
      phase: 'Returning · low battery',
      tone: 'warning',
      landingBattery: { label: '≈ 9%', tone: 'warning' },
    })
  })

  it('stands by without an active mission and stops an active one', async () => {
    const { status, abort } = setup({})
    status.stop()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(abort).toHaveBeenCalledWith('m-1')
    useMissionStore().apply({ ...mission, status: 'completed' })
    expect(status.summary.value).toMatchObject({ state: 'Standing by', detail: '18 UAVs ready' })
    expect(status.uavRows.value).toEqual([])
    expect(status.active.value).toBe(false)
  })
})

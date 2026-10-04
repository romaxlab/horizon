import type { Mission } from '@horizon/domain'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'
import { provideAppServices, type AppServices } from '@/app/providers/services'
import { MissionPlanningError, type MissionPlanner } from '../mission.types'
import { useMissionBuilder } from '../useMissionBuilder'

const plannedMission: Mission = {
  id: 'mission-001',
  name: 'Scan',
  type: 'area_scan',
  status: 'planned',
  area: { polygon: [] },
  altitude: 120,
  laps: null,
  target: null,
  radiusMeters: null,
  assignedUavIds: ['uav-01'],
  routes: [
    {
      uavId: 'uav-01',
      home: null,
      waypoints: [{ id: 'w0', latitude: 24.46, longitude: 54.36, altitude: 120, order: 0 }],
      distanceMeters: 2_400,
      estimatedDurationSec: 171,
    },
  ],
  createdAt: 0,
  startedAt: null,
  completedAt: null,
}

function setup(planner: Partial<MissionPlanner> = {}) {
  const plan = vi.fn(() => Promise.resolve(plannedMission))
  const launch = vi.fn(() => Promise.resolve())
  const missionPlanner: MissionPlanner = {
    plan,
    launch,
    abort: () => Promise.resolve(),
    getActiveMission: () => Promise.resolve(null),
    ...planner,
  }
  const app = createApp({})
  app.use(VueQueryPlugin, { queryClient: new QueryClient() })
  provideAppServices(app, { missionPlanner } as unknown as AppServices)
  const builder = app.runWithContext(() => useMissionBuilder({ availableUavs: ref(10) }))
  return { builder, plan, launch }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const corner = { latitude: 24.46, longitude: 54.36 }
const square = [
  corner,
  { latitude: 24.47, longitude: 54.36 },
  { latitude: 24.47, longitude: 54.37 },
]

describe('useMissionBuilder', () => {
  it('validates details before moving on to the area', () => {
    const { builder } = setup()
    builder.start()
    builder.uavCount.value = 99
    builder.next()
    expect(builder.step.value).toBe('details')
    expect(builder.detailErrors.value).toEqual(['Only 10 standby UAVs available'])

    builder.uavCount.value = 4
    builder.next()
    expect(builder.step.value).toBe('area')
    expect(builder.drawing.value).toBe(true)
  })

  it('collects area points only while drawing, with undo and clear', () => {
    const { builder } = setup()
    builder.start()
    builder.addPoint(corner)
    expect(builder.area.value).toEqual([])

    builder.next()
    square.forEach((p) => {
      builder.addPoint(p)
    })
    builder.undoPoint()
    expect(builder.area.value).toHaveLength(2)
    expect(builder.areaReady.value).toBe(false)
    builder.clearArea()
    expect(builder.area.value).toEqual([])
  })

  it('plans, reviews and launches through the MissionPlanner', async () => {
    const { builder, plan, launch } = setup()
    builder.start()
    builder.next()
    square.forEach((p) => {
      builder.addPoint(p)
    })
    builder.generate()
    await flush()

    expect(plan).toHaveBeenCalledWith({
      name: 'Area Scan',
      type: 'area_scan',
      area: { polygon: square },
      altitude: 120,
      uavCount: 6,
      laps: 3,
      radiusMeters: 150,
    })
    expect(builder.step.value).toBe('review')
    expect(builder.overlay.value?.phase).toBe('planned')
    expect(builder.summary.value).toMatchObject({ uavCount: 1, waypoints: 1, distanceKm: 2.4 })

    builder.launch()
    await flush()
    expect(launch).toHaveBeenCalledWith('mission-001')
    expect(builder.open.value).toBe(false)
    expect(builder.overlay.value).toBeNull()
  })

  it('plans a patrol: the default name follows the type, laps are validated', async () => {
    const { builder, plan } = setup()
    builder.start()
    builder.setType('patrol')
    expect(builder.name.value).toBe('Patrol')
    builder.laps.value = 0
    expect(builder.detailErrors.value).toContain('Laps must be 1–10')
    builder.laps.value = 2
    builder.next()
    square.forEach((p) => {
      builder.addPoint(p)
    })
    expect(builder.overlay.value?.shape).toBe('loop')
    builder.generate()
    await flush()
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({ type: 'patrol', laps: 2 }))

    // A name the operator typed is kept when switching type.
    builder.start()
    builder.name.value = 'North fence'
    builder.setType('patrol')
    expect(builder.name.value).toBe('North fence')
  })

  it('plans a point inspection around one target that a second click moves', async () => {
    const { builder, plan } = setup()
    builder.start()
    builder.setType('point_inspection')
    expect(builder.name.value).toBe('Point Inspection')
    builder.radius.value = 10
    expect(builder.detailErrors.value).toContain('Radius must be 30–1000 m')
    builder.radius.value = 200
    builder.next()
    const [first, second] = square
    if (!first || !second) throw new Error('fixture')
    builder.addPoint(first)
    builder.addPoint(second)
    expect(builder.area.value).toEqual([second])
    expect(builder.areaReady.value).toBe(true)
    expect(builder.overlay.value).toMatchObject({
      shape: 'orbit',
      orbit: { target: second, radiusMeters: 200 },
    })
    builder.generate()
    await flush()
    expect(plan).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'point_inspection',
        area: { polygon: [second] },
        radiusMeters: 200,
      }),
    )
  })

  it('surfaces planning errors and stays on the area step', async () => {
    const { builder } = setup({
      plan: () => Promise.reject(new MissionPlanningError('Area is too small for 6 UAVs')),
    })
    builder.start()
    builder.next()
    square.forEach((p) => {
      builder.addPoint(p)
    })
    builder.generate()
    await flush()

    expect(builder.step.value).toBe('area')
    expect(builder.error.value).toBe('Area is too small for 6 UAVs')
  })
})

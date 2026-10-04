import { createSimulator } from '@horizon/simulator'
import { describe, expect, it, vi } from 'vitest'
import { createRestAirspaceRepository } from '@/modules/airspace'
import { createRemoteMissionPlanner, MissionPlanningError } from '@/modules/mission-planning'
import { createRemoteVideoProvider } from '@/modules/video-monitoring'
import { createHttpClient } from '@/shared/http'

const API = 'https://api.horizon.test/v1'
const START = Date.UTC(2026, 0, 1)

type Route = (init: RequestInit) => { status: number; body?: unknown }

/** Fake backend over fetch: routes by "METHOD path". */
function fakeFetch(routes: Record<string, Route>) {
  return vi.fn<typeof fetch>((input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const key = `${init.method ?? 'GET'} ${url.pathname.replace('/v1/', '')}`
    const route = routes[key]
    if (!route) return Promise.resolve(new Response(null, { status: 404 }))
    const { status, body } = route(init)
    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    )
  })
}

describe('createRemoteMissionPlanner', () => {
  const backend = createSimulator({ startTime: START })
  const planBody = backend.planMission({
    type: 'area_scan',
    name: 'Scan',
    area: {
      polygon: [
        { lat: 24.4625, lon: 54.36 },
        { lat: 24.472, lon: 54.3615 },
        { lat: 24.4735, lon: 54.372 },
        { lat: 24.466, lon: 54.3745 },
      ],
    },
    altitude_m: 120,
    uav_count: 2,
  })
  if (!planBody.ok) throw new Error(planBody.reason)

  it('plans, launches, aborts and reads the current mission over REST', async () => {
    const requests: string[] = []
    const fetch = fakeFetch({
      'POST missions/plan': (init) => {
        requests.push(`plan ${typeof init.body === 'string' ? init.body : ''}`)
        return { status: 200, body: planBody.mission }
      },
      [`POST missions/${planBody.mission.id}/launch`]: () => ({ status: 204 }),
      [`POST missions/${planBody.mission.id}/abort`]: () => ({ status: 204 }),
      'GET missions/current': () => ({ status: 204 }),
    })
    const planner = createRemoteMissionPlanner(createHttpClient({ baseUrl: API, fetch }))

    const mission = await planner.plan({
      name: 'Scan',
      type: 'area_scan',
      area: { polygon: [{ latitude: 24.46, longitude: 54.36 }] },
      altitude: 120,
      uavCount: 2,
      laps: 3,
      radiusMeters: 150,
    })
    expect(mission).toMatchObject({ id: planBody.mission.id, status: 'planned' })
    expect(mission.routes).toHaveLength(2)
    const body: unknown = JSON.parse(requests[0]?.slice(5) ?? '{}')
    expect(body).toMatchObject({ type: 'area_scan', altitude_m: 120, uav_count: 2 })
    // Laps and radius are patrol/inspection parameters only.
    expect(body).not.toHaveProperty('laps')
    expect(body).not.toHaveProperty('radius_m')

    await planner.launch(mission.id)
    await planner.abort(mission.id)
    await expect(planner.getActiveMission()).resolves.toBeNull()
  })

  it('maps backend rejections to planning errors with the backend message', async () => {
    const planner = createRemoteMissionPlanner(
      createHttpClient({
        baseUrl: API,
        fetch: fakeFetch({
          'POST missions/plan': () => ({ status: 422, body: { message: 'Area is too small' } }),
          'POST missions/m-1/launch': () => ({ status: 503 }),
        }),
      }),
    )
    const request = {
      name: 'x',
      type: 'area_scan' as const,
      area: { polygon: [] },
      altitude: 120,
      uavCount: 1,
      laps: 1,
      radiusMeters: 150,
    }
    await expect(planner.plan(request)).rejects.toEqual(
      new MissionPlanningError('Area is too small'),
    )
    await expect(planner.launch('m-1')).rejects.toMatchObject({ name: 'HttpError', status: 503 })
  })

  it('keeps every conflicting no-fly zone of a rejected plan, ignoring invalid ids', async () => {
    const planner = createRemoteMissionPlanner(
      createHttpClient({
        baseUrl: API,
        fetch: fakeFetch({
          'POST missions/plan': () => ({
            status: 409,
            body: {
              message: 'Mission area lies inside no-fly zones "Marina", "Palace grounds"',
              geofence_ids: ['nfz-marina', 'nfz-palace', 42],
            },
          }),
        }),
      }),
    )
    const request = {
      name: 'x',
      type: 'area_scan' as const,
      area: { polygon: [] },
      altitude: 120,
      uavCount: 1,
      laps: 1,
      radiusMeters: 150,
    }
    await expect(planner.plan(request)).rejects.toMatchObject({
      geofenceIds: ['nfz-marina', 'nfz-palace'],
    })
  })
})

describe('createRestAirspaceRepository', () => {
  it('maps the simulator geofence payload and rejects invalid zones', async () => {
    const zones = createSimulator({ startTime: START }).getGeofences()
    const repository = (body: unknown) =>
      createRestAirspaceRepository(
        createHttpClient({
          baseUrl: API,
          fetch: fakeFetch({ 'GET airspace/geofences': () => ({ status: 200, body }) }),
        }),
      )
    const geofences = await repository(zones).getGeofences()
    expect(geofences).toHaveLength(zones.length)
    expect(geofences[0]?.polygon[0]).toEqual({
      latitude: zones[0]?.polygon[0]?.lat,
      longitude: zones[0]?.polygon[0]?.lon,
    })
    await expect(
      repository([{ id: 'x', name: 'Bad', polygon: [] }]).getGeofences(),
    ).rejects.toMatchObject({ name: 'AirspacePayloadError' })
  })
})

describe('createRemoteVideoProvider', () => {
  it('maps a video source and treats 404 as no camera', async () => {
    const provider = createRemoteVideoProvider(
      createHttpClient({
        baseUrl: API,
        fetch: fakeFetch({
          'GET uavs/uav-01/video': () => ({
            status: 200,
            body: {
              kind: 'synthetic-imagery',
              tile_url_template: 'https://tiles.test/{z}/{y}/{x}',
              max_zoom: 19,
              attribution: 'Test imagery',
            },
          }),
        }),
      }),
    )
    await expect(provider.getSource('uav-01')).resolves.toEqual({
      kind: 'synthetic-imagery',
      tileUrlTemplate: 'https://tiles.test/{z}/{y}/{x}',
      maxZoom: 19,
      attribution: 'Test imagery',
    })
    await expect(provider.getSource('uav-02')).resolves.toBeNull()
  })
})

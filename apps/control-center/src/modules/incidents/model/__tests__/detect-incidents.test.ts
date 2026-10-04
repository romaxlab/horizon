import { describe, expect, it } from 'vitest'
import { detectIncidents } from '../detect-incidents'
import type { Observation, UavObservation } from '../incident.types'

const uav = (overrides: Partial<UavObservation> = {}): UavObservation => ({
  id: 'uav-03',
  name: 'UAV-03',
  link: 'live',
  battery: 80,
  lowBattery: false,
  weakSignal: false,
  geofence: null,
  ...overrides,
})

const observe = (uavs: UavObservation[], overrides: Partial<Observation> = {}): Observation => ({
  backendLive: true,
  uavs,
  mission: { id: 'm-1', name: 'Scan', status: 'active' },
  ...overrides,
})

const types = (result: ReturnType<typeof detectIncidents>) => result.incidents.map((i) => i.type)

describe('detectIncidents', () => {
  it('only sets a baseline on the first observation', () => {
    expect(detectIncidents(null, observe([uav({ lowBattery: true })])).incidents).toEqual([])
  })

  it('raises low battery once, with the level, and resolves it when cleared', () => {
    const before = observe([uav()])
    const low = observe([uav({ lowBattery: true, battery: 18.4 })])
    const result = detectIncidents(before, low)
    expect(result.incidents).toEqual([
      {
        type: 'LOW_BATTERY',
        severity: 'critical',
        uavId: 'uav-03',
        uavName: 'UAV-03',
        missionId: 'm-1',
        detail: '18%',
      },
    ])
    expect(detectIncidents(low, low).incidents).toEqual([])
    expect(detectIncidents(low, before).resolutions).toEqual([
      { uavId: 'uav-03', types: ['LOW_BATTERY'] },
    ])
  })

  it('raises a breach when a UAV enters a no-fly zone and resolves it on exit', () => {
    const outside = observe([uav()])
    const inside = observe([uav({ geofence: 'Marina' })])
    const result = detectIncidents(outside, inside)
    expect(result.incidents).toEqual([
      {
        type: 'GEOFENCE_BREACH',
        severity: 'critical',
        uavId: 'uav-03',
        uavName: 'UAV-03',
        missionId: 'm-1',
        detail: 'Marina',
      },
    ])
    expect(detectIncidents(inside, inside).incidents).toEqual([])
    expect(detectIncidents(inside, outside).resolutions).toEqual([
      { uavId: 'uav-03', types: ['GEOFENCE_BREACH'] },
    ])
  })

  it('follows a UAV link through stale, lost and restored', () => {
    const fresh = observe([uav()])
    const stale = observe([uav({ link: 'stale' })])
    const offline = observe([uav({ link: 'offline' })])
    expect(types(detectIncidents(fresh, stale))).toEqual(['TELEMETRY_STALE'])
    expect(types(detectIncidents(stale, offline))).toEqual(['CONNECTION_LOST'])
    const restored = detectIncidents(offline, fresh)
    expect(types(restored)).toEqual(['CONNECTION_RESTORED'])
    expect(restored.resolutions).toEqual([
      { uavId: 'uav-03', types: ['TELEMETRY_STALE', 'CONNECTION_LOST'] },
    ])
  })

  it('reports a backend outage once instead of per-UAV link noise', () => {
    const fleet = [uav(), uav({ id: 'uav-04', name: 'UAV-04' })]
    const live = observe(fleet)
    const down = observe(
      fleet.map((u) => ({ ...u, link: 'offline' as const })),
      { backendLive: false },
    )
    expect(types(detectIncidents(live, down))).toEqual(['CONNECTION_LOST'])
    expect(detectIncidents(live, down).incidents[0]?.uavId).toBeNull()

    const back = detectIncidents(down, live)
    expect(types(back)).toEqual(['CONNECTION_RESTORED'])
    expect(back.resolutions).toEqual([{ uavId: null, types: ['CONNECTION_LOST'] }])
  })

  it('reports mission lifecycle changes', () => {
    const idle = observe([], { mission: null })
    const active = observe([])
    expect(types(detectIncidents(idle, active))).toEqual(['MISSION_STARTED'])
    expect(
      types(
        detectIncidents(
          active,
          observe([], { mission: { id: 'm-1', name: 'Scan', status: 'aborted' } }),
        ),
      ),
    ).toEqual(['MISSION_ABORTED'])
  })
})

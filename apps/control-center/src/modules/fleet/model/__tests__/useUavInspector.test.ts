import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { telemetry, uav } from '../fleet.fixtures.test-utils'
import { useFleetStore } from '../fleet.store'
import { useUavInspector } from '../useUavInspector'

describe('useUavInspector', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is empty without a selection', () => {
    expect(useUavInspector(ref(0)).inspector.value).toBeNull()
  })

  it('presents the selected UAV telemetry and health', () => {
    const store = useFleetStore()
    store.hydrate(
      {
        serverTime: 10_000,
        uavs: [uav('uav-01')],
        telemetry: [
          telemetry('uav-01', 10_000, {
            battery: 15,
            heading: 315,
            position: { latitude: 24.45, longitude: 54.39, altitude: 120 },
            missionId: 'm-1',
            currentWaypoint: 4,
          }),
        ],
      },
      10_000,
    )
    store.selectUav('uav-01')

    const view = useUavInspector(ref(13_000)).inspector.value
    expect(view).toMatchObject({
      name: 'UAV-01',
      subtitle: 'Falcon X4 · HZN-uav-01',
      status: { label: 'Warning' },
      battery: { label: '15%', tone: 'danger' },
      issues: ['Low battery'],
      lastUpdate: { label: '3s ago', degraded: false },
    })
    expect(view?.metrics.find((m) => m.label === 'Heading')).toMatchObject({
      value: '315°',
      unit: 'NW',
    })
    expect(view?.metrics.find((m) => m.label === 'Altitude')?.value).toBe('120')
    expect(view?.glance).toEqual(['15%', '120 m', expect.stringMatching(/ m\/s$/)])
  })

  it('hides health issues while the link is degraded', () => {
    const store = useFleetStore()
    store.hydrate(
      { serverTime: 0, uavs: [uav('uav-01')], telemetry: [telemetry('uav-01', 0, { battery: 5 })] },
      0,
    )
    store.selectUav('uav-01')
    store.refreshStatuses(20_000)

    const view = useUavInspector(ref(20_000)).inspector.value
    expect(view).toMatchObject({
      status: { label: 'Offline' },
      issues: [],
      lastUpdate: { degraded: true },
    })
  })

  it('exposes trends once the UAV has history from live telemetry', () => {
    const store = useFleetStore()
    store.hydrate({ serverTime: 0, uavs: [uav('uav-01')], telemetry: [telemetry('uav-01', 0)] }, 0)
    store.selectUav('uav-01')
    const { inspector } = useUavInspector(ref(0))
    expect(inspector.value?.trends).toBeNull()

    store.applyTelemetry([telemetry('uav-01', 1000, { speed: 8, battery: 15 })], 1000)
    expect(inspector.value?.trends).toMatchObject({
      window: 'Last 5 min',
      series: [
        { label: 'Altitude', values: [0, 0] },
        { label: 'Speed', values: [0, 8] },
        { label: 'Battery', values: [90, 15], tone: 'danger' },
      ],
    })
  })
})

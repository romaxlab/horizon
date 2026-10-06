import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { telemetry, uav } from '../../model/fleet.fixtures.test-utils'
import { useFleetStore } from '../../store/fleet.store'
import { useFleetPanel } from '../useFleetPanel'

describe('useFleetPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useFleetStore()
    store.hydrate(
      {
        serverTime: 100_000,
        uavs: [uav('uav-01', { model: 'Kestrel M2' }), uav('uav-02'), uav('uav-03'), uav('uav-04')],
        telemetry: [
          telemetry('uav-01', 100_000, { missionId: 'm-1' }),
          telemetry('uav-02', 100_000, { battery: 12, missionId: 'm-1' }),
          telemetry('uav-03', 100_000),
          // Last heard 20 s before the snapshot: offline.
          telemetry('uav-04', 80_000),
        ],
      },
      100_000,
    )
  })

  it('counts statuses into filter options', () => {
    const { filterOptions } = useFleetPanel(ref(100_000))
    expect(filterOptions.value.map((o) => o.label)).toEqual([
      'All 4',
      'Active 1',
      'Alerts 2',
      'Standby 1',
    ])
  })

  it('filters by status group', () => {
    const panel = useFleetPanel(ref(100_000))
    panel.filter.value = 'alerts'
    expect(panel.rows.value.map((r) => r.id)).toEqual(['uav-02', 'uav-04'])
    panel.filter.value = 'active'
    expect(panel.rows.value.map((r) => r.id)).toEqual(['uav-01'])
  })

  it('searches name, callsign and model, all terms required', () => {
    const panel = useFleetPanel(ref(100_000))
    panel.query.value = 'kestrel'
    expect(panel.rows.value.map((r) => r.id)).toEqual(['uav-01'])
    panel.query.value = 'HZN-uav-03'
    expect(panel.rows.value.map((r) => r.id)).toEqual(['uav-03'])
    panel.query.value = 'falcon uav-02'
    expect(panel.rows.value.map((r) => r.id)).toEqual(['uav-02'])
  })

  it('shows last seen only for degraded links and flags low battery', () => {
    const { rows } = useFleetPanel(ref(100_000))
    const byId = Object.fromEntries(rows.value.map((r) => [r.id, r]))
    expect(byId['uav-04']?.lastSeen).toBe('20s ago')
    expect(byId['uav-01']?.lastSeen).toBeNull()
    expect(byId['uav-02']).toMatchObject({ battery: '12%', batteryLow: true })
  })

  it('marks the shared selection', () => {
    useFleetStore().selectUav('uav-03')
    const { rows } = useFleetPanel(ref(100_000))
    expect(rows.value.filter((r) => r.selected).map((r) => r.id)).toEqual(['uav-03'])
  })

  it('keeps row identity when visible values do not change', () => {
    const store = useFleetStore()
    const { rows } = useFleetPanel(ref(100_000))
    const before = rows.value.find((r) => r.id === 'uav-01')

    // Same rounded battery: no visible change, same row object.
    store.applyTelemetry(
      [telemetry('uav-01', 100_250, { missionId: 'm-1', battery: 90.2 })],
      100_250,
    )
    expect(rows.value.find((r) => r.id === 'uav-01')).toBe(before)

    store.applyTelemetry([telemetry('uav-01', 100_500, { missionId: 'm-1', battery: 80 })], 100_500)
    expect(rows.value.find((r) => r.id === 'uav-01')).not.toBe(before)
  })
})

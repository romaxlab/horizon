import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { telemetry, uav } from './fleet.fixtures.test-utils'
import { useFleetStore } from './fleet.store'

describe('useFleetStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('hydrates from a snapshot, aging samples by the server clock', () => {
    const store = useFleetStore()
    store.hydrate(
      { serverTime: 10_000, uavs: [uav('a'), uav('b')], telemetry: [telemetry('a', 7_000)] },
      50_000,
    )

    expect(store.uavs.map((s) => s.uav.id)).toEqual(['a', 'b'])
    expect(store.uavsById.a?.lastUpdatedAt).toBe(47_000)
    expect(store.uavsById.b).toMatchObject({ telemetry: null, status: 'offline' })
  })

  it('keeps newer streamed telemetry when reconciling an older snapshot', () => {
    const store = useFleetStore()
    store.hydrate({ serverTime: 1, uavs: [uav('a')], telemetry: [telemetry('a', 1)] }, 1)
    store.applyTelemetry([telemetry('a', 9, { missionId: 'm-1' })], 9)
    store.hydrate({ serverTime: 5, uavs: [uav('a')], telemetry: [telemetry('a', 5)] }, 10)

    expect(store.uavsById.a?.telemetry?.timestamp).toBe(9)
    expect(store.uavsById.a).toMatchObject({ status: 'active', missionState: 'executing' })
  })

  it('applies telemetry batches and ignores unknown UAVs', () => {
    const store = useFleetStore()
    store.hydrate({ serverTime: 0, uavs: [uav('a')], telemetry: [] }, 0)

    const ignored = store.applyTelemetry([telemetry('a', 3), telemetry('ghost', 3)], 100)

    expect(ignored).toBe(1)
    expect(store.uavsById.a).toMatchObject({ lastUpdatedAt: 100, status: 'standby' })
    expect(store.uavsById.ghost).toBeUndefined()
  })

  it('keeps a single selection by id and clears it when the UAV disappears', () => {
    const store = useFleetStore()
    store.hydrate({ serverTime: 0, uavs: [uav('a'), uav('b')], telemetry: [] }, 0)

    store.selectUav('b')
    expect(store.selectedUavId).toBe('b')
    store.selectUav('ghost')
    expect(store.selectedUavId).toBeNull()

    store.selectUav('a')
    store.hydrate({ serverTime: 1, uavs: [uav('b')], telemetry: [] }, 1)
    expect(store.selectedUavId).toBeNull()
  })

  it('ages UAVs to stale and offline without new telemetry, and recovers on new data', () => {
    const store = useFleetStore()
    store.hydrate(
      { serverTime: 0, uavs: [uav('a')], telemetry: [telemetry('a', 0, { missionId: 'm-1' })] },
      0,
    )
    expect(store.uavsById.a?.status).toBe('active')

    store.refreshStatuses(6_000)
    expect(store.uavsById.a?.status).toBe('stale')
    store.refreshStatuses(16_000)
    expect(store.uavsById.a?.status).toBe('offline')
    expect(store.statusCounts.offline).toBe(1)

    store.applyTelemetry([telemetry('a', 16_000, { missionId: 'm-1' })], 16_000)
    expect(store.uavsById.a?.status).toBe('active')
    expect(store.uavsById.a?.telemetry?.position).toBeDefined()
  })
})

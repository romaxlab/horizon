import { createMockRealtimeTransport, type MessageSource } from '@horizon/realtime'
import { createSimulator } from '@horizon/simulator'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseFleetSnapshot } from '../api/fleet.parsers'
import { createFleetSync, type FleetSyncTarget } from './fleet-sync'
import { useFleetStore } from './fleet.store'

const START = Date.UTC(2026, 0, 1)

function setup(extraSource?: MessageSource) {
  const simulator = createSimulator({ startTime: START })
  const transport = createMockRealtimeTransport(extraSource ?? simulator)
  const store = useFleetStore()
  const applyTelemetry = vi.spyOn(store, 'applyTelemetry')
  const logger = { warn: vi.fn() }
  const sync = createFleetSync({
    transport,
    target: store,
    loadSnapshot: () => Promise.resolve(parseFleetSnapshot(simulator.getFleetSnapshot())),
    now: () => simulator.now,
    logger,
  })
  return { simulator, store, sync, applyTelemetry, logger }
}

describe('createFleetSync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hydrates from the snapshot and goes live', async () => {
    const { store, sync } = setup()
    expect(store.connectionStatus).toBe('connecting')

    await sync.start()

    expect(store.connectionStatus).toBe('live')
    expect(store.uavs).toHaveLength(24)
    expect(store.uavs.every((s) => s.status === 'standby')).toBe(true)
  })

  it('streams simulator telemetry into the store in batches, not per message', async () => {
    const { simulator, store, sync, applyTelemetry } = setup()
    await sync.start()
    let messages = 0
    simulator.subscribe(() => (messages += 1))

    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(1_000)
    vi.advanceTimersByTime(100)

    expect(messages).toBeGreaterThan(24)
    expect(applyTelemetry).toHaveBeenCalledTimes(1)
    expect(store.uavs.filter((s) => s.status === 'active')).toHaveLength(6)
    const active = store.uavs.find((s) => s.status === 'active')
    expect(active?.telemetry?.timestamp).toBe(simulator.now)
  })

  it('ignores out-of-order and invalid messages', async () => {
    const listeners = new Set<(message: unknown) => void>()
    const push = (message: unknown) => {
      listeners.forEach((listener) => {
        listener(message)
      })
    }
    const { simulator, store, sync, logger } = setup({
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    })
    await sync.start()
    const [latest] = simulator.getFleetSnapshot().telemetry
    if (!latest) throw new Error('expected telemetry')

    push({ type: 'telemetry', data: { ...latest, ts: latest.ts + 2_000, battery_pct: 50 } })
    push({ type: 'telemetry', data: { ...latest, ts: latest.ts + 1_000, battery_pct: 10 } })
    push({ type: 'telemetry', data: { ...latest, lat: 'north' } })
    push({ type: 'mission', data: {} })
    vi.advanceTimersByTime(100)

    expect(store.uavsById[latest.uav_id]?.telemetry?.battery).toBe(50)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('reports offline when the snapshot cannot be loaded', async () => {
    const store = useFleetStore()
    const logger = { warn: vi.fn() }
    const target: FleetSyncTarget = store
    const sync = createFleetSync({
      transport: createMockRealtimeTransport(createSimulator()),
      target,
      loadSnapshot: () => Promise.reject(new Error('down')),
      logger,
    })

    await sync.start()

    expect(store.connectionStatus).toBe('offline')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('discards a snapshot that arrives after stop()', async () => {
    const store = useFleetStore()
    const simulator = createSimulator({ startTime: START })
    let resolveSnapshot: () => void = () => undefined
    const sync = createFleetSync({
      transport: createMockRealtimeTransport(simulator),
      target: store,
      loadSnapshot: () =>
        new Promise((resolve) => {
          resolveSnapshot = () => {
            resolve(parseFleetSnapshot(simulator.getFleetSnapshot()))
          }
        }),
    })

    const starting = sync.start()
    await Promise.resolve()
    sync.stop()
    resolveSnapshot()
    await starting

    expect(store.uavs).toHaveLength(0)
    expect(store.connectionStatus).toBe('connecting')
  })

  it('stops flushing after stop()', async () => {
    const { simulator, sync, applyTelemetry } = setup()
    await sync.start()
    sync.stop()

    simulator.step(1_000)
    vi.advanceTimersByTime(500)

    expect(applyTelemetry).not.toHaveBeenCalled()
  })
})

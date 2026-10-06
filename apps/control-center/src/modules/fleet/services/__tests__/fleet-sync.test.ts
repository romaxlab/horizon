import { createMockRealtimeTransport, type MessageSource } from '@horizon/realtime'
import { createSimulator } from '@horizon/simulator'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseFleetSnapshot } from '../../api/fleet.parsers'
import { createFleetSync, type FleetSyncTarget } from '../fleet-sync'
import { useFleetStore } from '../../store/fleet.store'

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

  it('keeps retrying when the snapshot cannot be loaded', async () => {
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

    expect(store.connectionStatus).toBe('reconnecting')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('a resync supersedes a pending reconnect attempt', async () => {
    const simulator = createSimulator({ startTime: START })
    const store = useFleetStore()
    const onReconnected = vi.fn()
    let reachable = false
    const loadSnapshot = vi.fn(() =>
      reachable
        ? Promise.resolve(parseFleetSnapshot(simulator.getFleetSnapshot()))
        : Promise.reject(new Error('down')),
    )
    const sync = createFleetSync({
      transport: createMockRealtimeTransport(simulator),
      target: store,
      loadSnapshot,
      logger: { warn: vi.fn() },
      reconnectDelaysMs: [1_000],
      onReconnected,
    })
    await sync.start()
    expect(store.connectionStatus).toBe('reconnecting')

    reachable = true
    await sync.resync()
    expect(store.connectionStatus).toBe('live')
    await vi.advanceTimersByTimeAsync(2_000)

    // The pending reconnect never ran: no second snapshot, no reconnect notification.
    expect(loadSnapshot).toHaveBeenCalledTimes(2)
    expect(onReconnected).not.toHaveBeenCalled()
    sync.stop()
  })

  it('a background tab raises no false link alerts; on return the fleet resyncs first', async () => {
    const simulator = createSimulator({ startTime: START })
    const store = useFleetStore()
    let hidden = false
    let notify: (hidden: boolean) => void = () => undefined
    const loadSnapshot = vi.fn(() =>
      Promise.resolve(parseFleetSnapshot(simulator.getFleetSnapshot())),
    )
    const sync = createFleetSync({
      transport: createMockRealtimeTransport(simulator),
      target: store,
      loadSnapshot,
      now: () => Date.now(),
      visibility: {
        hidden: () => hidden,
        subscribe: (listener) => {
          notify = listener
          return () => undefined
        },
      },
    })
    await sync.start()
    expect(store.statusCounts.offline).toBe(0)

    // Hidden for a minute: the throttled tab delivers nothing, statuses are left as they were.
    hidden = true
    notify(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(store.statusCounts.offline + store.statusCounts.stale).toBe(0)

    // Back: a fresh snapshot is loaded before statuses are judged again.
    hidden = false
    notify(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(loadSnapshot).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(store.statusCounts.offline + store.statusCounts.stale).toBe(0)
    sync.stop()
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

  it('recovers from a network outage: reconnecting, ages state, resyncs and goes live', async () => {
    const onReconnected = vi.fn()
    const simulator = createSimulator({ startTime: START })
    const store = useFleetStore()
    const sync = createFleetSync({
      transport: createMockRealtimeTransport(simulator),
      target: store,
      loadSnapshot: () =>
        simulator.networkUp
          ? Promise.resolve(parseFleetSnapshot(simulator.getFleetSnapshot()))
          : Promise.reject(new Error('unreachable')),
      now: () => simulator.now,
      logger: { warn: vi.fn() },
      reconnectDelaysMs: [1_000],
      onReconnected,
    })
    await sync.start()
    expect(onReconnected).not.toHaveBeenCalled()
    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(2_000)
    vi.advanceTimersByTime(100)
    expect(store.connectionStatus).toBe('live')

    simulator.dispatch({ type: 'setNetwork', up: false })
    expect(store.connectionStatus).toBe('reconnecting')
    const lastKnown = store.uavsById['uav-01']?.telemetry?.position

    // 20 s without data: UAVs age to offline but keep their last known position.
    for (let i = 0; i < 20; i++) {
      simulator.step(1_000)
      await vi.advanceTimersByTimeAsync(1_000)
    }
    expect(store.connectionStatus).toBe('reconnecting')
    expect(store.uavsById['uav-01']).toMatchObject({ status: 'offline' })
    expect(store.uavsById['uav-01']?.telemetry?.position).toEqual(lastKnown)

    simulator.dispatch({ type: 'setNetwork', up: true })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(store.connectionStatus).toBe('live')
    expect(store.uavsById['uav-01']?.telemetry?.timestamp).toBe(simulator.now)
    expect(store.statusCounts.offline).toBe(0)
    // Other live state (the mission) is told to reload once the link is back.
    expect(onReconnected).toHaveBeenCalledTimes(1)
    sync.stop()
  })

  it('coalesces a burst per UAV, drops stale samples and counts both', async () => {
    const listeners = new Set<(message: unknown) => void>()
    const push = (message: unknown) => {
      listeners.forEach((listener) => {
        listener(message)
      })
    }
    const { simulator, store, sync, applyTelemetry } = setup({
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    })
    await sync.start()
    const [a, b] = simulator.getFleetSnapshot().telemetry
    if (!a || !b) throw new Error('expected telemetry')

    // 10 samples per UAV within one flush window, plus one stale and one duplicate.
    for (let i = 1; i <= 10; i++) {
      push({ type: 'telemetry', data: { ...a, ts: a.ts + i * 100, battery_pct: 90 - i } })
      push({ type: 'telemetry', data: { ...b, ts: b.ts + i * 100 } })
    }
    push({ type: 'telemetry', data: { ...a, ts: a.ts + 500 } })
    push({ type: 'telemetry', data: { ...a, ts: a.ts + 1_000, battery_pct: 1 } })
    vi.advanceTimersByTime(100)

    expect(applyTelemetry).toHaveBeenCalledTimes(1)
    expect(applyTelemetry.mock.calls[0]?.[0]).toHaveLength(2)
    expect(store.uavsById[a.uav_id]?.telemetry?.battery).toBe(80)
    expect(sync.stats()).toMatchObject({ applied: 2, coalesced: 18, dropped: 2, flushes: 1 })
  })
})

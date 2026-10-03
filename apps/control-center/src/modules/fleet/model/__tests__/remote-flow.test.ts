import { createWebSocketRealtimeTransport, type WebSocketLike } from '@horizon/realtime'
import { createSimulator } from '@horizon/simulator'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpClient } from '@/shared/http'
import { createRestFleetRepository } from '../../api/fleet.repository'
import { createFleetSync } from '../fleet-sync'
import { useFleetStore } from '../fleet.store'

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

class FakeSocket implements WebSocketLike {
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  close = vi.fn()
  open() {
    this.onopen?.(new Event('open'))
  }
  send(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  }
  drop() {
    this.onclose?.({ code: 1006 } as CloseEvent)
  }
}

describe('remote fleet: REST snapshot → WebSocket stream → reconnect → resync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the full flow through the remote contracts', async () => {
    // The simulator stands in for the backend's data; the client only sees HTTP and WS.
    const backend = createSimulator({ startTime: START })
    let snapshots = 0
    const http = createHttpClient({
      baseUrl: API,
      fetch: fakeFetch({
        'GET fleet/snapshot': () => {
          snapshots += 1
          return { status: 200, body: backend.getFleetSnapshot() }
        },
      }),
    })
    const sockets: FakeSocket[] = []
    const transport = createWebSocketRealtimeTransport({
      url: 'wss://api.horizon.test/realtime',
      createSocket: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        // The server accepts the connection asynchronously.
        queueMicrotask(() => {
          socket.open()
        })
        return socket
      },
    })
    backend.subscribe((message) => sockets.at(-1)?.send(message))

    const store = useFleetStore()
    const sync = createFleetSync({
      transport,
      loadSnapshot: () => createRestFleetRepository(http).getSnapshot(),
      target: store,
      now: () => backend.now,
      logger: { warn: vi.fn() },
      reconnectDelaysMs: [1_000],
    })

    await sync.start()
    expect(store.connectionStatus).toBe('live')
    expect(store.uavs).toHaveLength(24)
    expect(snapshots).toBe(1)

    backend.dispatch({ type: 'startDemoMission' })
    backend.step(1_000)
    vi.advanceTimersByTime(100)
    expect(store.statusCounts.active).toBe(6)

    // Connection drops: reconnecting, then a new socket and a fresh snapshot.
    sockets[0]?.drop()
    expect(store.connectionStatus).toBe('reconnecting')
    backend.step(5_000)
    await vi.advanceTimersByTimeAsync(1_000)

    expect(sockets).toHaveLength(2)
    expect(snapshots).toBe(2)
    expect(store.connectionStatus).toBe('live')
    const active = store.uavs.find((s) => s.status === 'active')
    expect(active?.telemetry?.timestamp).toBe(backend.now)
    sync.stop()
  })
})

describe('createRestFleetRepository', () => {
  it('rejects invalid snapshot payloads', async () => {
    const http = createHttpClient({
      baseUrl: API,
      fetch: fakeFetch({ 'GET fleet/snapshot': () => ({ status: 200, body: { uavs: 'x' } }) }),
    })
    await expect(createRestFleetRepository(http).getSnapshot()).rejects.toThrow(
      'Invalid fleet snapshot',
    )
  })
})

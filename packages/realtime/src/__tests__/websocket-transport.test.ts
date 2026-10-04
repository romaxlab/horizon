import { describe, expect, it, vi } from 'vitest'
import type { RealtimeEvent } from '../transport'
import {
  createWebSocketRealtimeTransport,
  IDLE_CLOSE_CODE,
  type WebSocketLike,
} from '../websocket-transport'

class FakeSocket implements WebSocketLike {
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  close = vi.fn()

  open() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }
  receive(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
  drop(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code } as CloseEvent)
  }
}

function setup() {
  const sockets: FakeSocket[] = []
  const transport = createWebSocketRealtimeTransport({
    url: 'wss://api.test/realtime',
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    logger: { warn: vi.fn() },
  })
  const events: RealtimeEvent[] = []
  transport.subscribe((event) => events.push(event))
  return { transport, sockets, events }
}

describe('createWebSocketRealtimeTransport', () => {
  it('opens, forwards parsed JSON messages and reports status', async () => {
    const { transport, sockets, events } = setup()
    const connected = transport.connect()
    sockets[0]?.open()
    await connected

    sockets[0]?.receive('{"type":"telemetry","data":{"uav_id":"uav-01"}}')
    sockets[0]?.receive('not json')
    sockets[0]?.receive(new ArrayBuffer(4))

    expect(events).toEqual([
      { type: 'status', status: 'connecting' },
      { type: 'status', status: 'open' },
      { type: 'message', payload: { type: 'telemetry', data: { uav_id: 'uav-01' } } },
    ])
  })

  it('rejects connect when the socket closes before opening', async () => {
    const { transport, sockets } = setup()
    const connected = transport.connect()
    sockets[0]?.drop(1006)
    await expect(connected).rejects.toThrow('WebSocket closed (1006)')
  })

  it('reports an unexpected close and can connect again with a new socket', async () => {
    const { transport, sockets, events } = setup()
    const first = transport.connect()
    sockets[0]?.open()
    await first
    sockets[0]?.drop()
    expect(events.at(-1)).toEqual({ type: 'status', status: 'closed' })

    const second = transport.connect()
    sockets[1]?.open()
    await second
    expect(sockets).toHaveLength(2)
  })

  it('closes the socket on disconnect without further events from it', async () => {
    const { transport, sockets, events } = setup()
    const connected = transport.connect()
    sockets[0]?.open()
    await connected
    transport.disconnect()
    sockets[0]?.receive('{"late":true}')

    expect(sockets[0]?.close).toHaveBeenCalledWith(1000, 'client disconnect')
    expect(events.at(-1)).toEqual({ type: 'status', status: 'closed' })
    expect(events.some((e) => e.type === 'message')).toBe(false)
  })

  it('closes a silent link after the idle timeout; any message keeps it alive', async () => {
    vi.useFakeTimers()
    try {
      const { transport, sockets, events } = setup()
      const connected = transport.connect()
      sockets[0]?.open()
      await connected

      vi.advanceTimersByTime(10_000)
      sockets[0]?.receive('{"type":"heartbeat","data":{"server_time":1}}')
      vi.advanceTimersByTime(10_000)
      expect(sockets[0]?.close).not.toHaveBeenCalled()

      vi.advanceTimersByTime(5_000)
      expect(sockets[0]?.close).toHaveBeenCalledWith(IDLE_CLOSE_CODE, 'idle timeout')
      expect(events.at(-1)).toEqual({ type: 'status', status: 'closed' })

      // Reconnecting uses a fresh socket and a fresh watchdog.
      const again = transport.connect()
      sockets[1]?.open()
      await again
      expect(sockets).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

import type { RealtimeEvent, RealtimeTransport } from './transport'

export class TransportConnectError extends Error {
  override name = 'TransportConnectError'
}

/** The subset of the WebSocket API the transport uses (injectable for tests). */
export interface WebSocketLike {
  readonly readyState: number
  onopen: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  close(code?: number, reason?: string): void
}

export interface WebSocketTransportOptions {
  url: string
  createSocket?: (url: string) => WebSocketLike
  logger?: Pick<Console, 'warn'>
  /**
   * Liveness watchdog: with no message (telemetry or `heartbeat`) for this long, the link is
   * treated as dead and closed. Catches half-open sockets that never fire `close` on their own.
   */
  idleTimeoutMs?: number
}

/** The backend sends a heartbeat every 5 s; three missed beats mean the link is gone. */
export const DEFAULT_IDLE_TIMEOUT_MS = 15_000

/** Application close code for a link closed by the liveness watchdog. */
export const IDLE_CLOSE_CODE = 4000

/**
 * Realtime transport over a WebSocket carrying JSON message envelopes. It does not reconnect by
 * itself: an unexpected close is reported as `closed`, and the fleet sync decides when to
 * reconnect and resync from a fresh snapshot (same flow as the mock transport).
 */
export function createWebSocketRealtimeTransport({
  url,
  createSocket = (target) => new WebSocket(target),
  logger = console,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}: WebSocketTransportOptions): RealtimeTransport {
  const handlers = new Set<(event: RealtimeEvent) => void>()
  let socket: WebSocketLike | null = null
  let connecting: Promise<void> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  const emit = (event: RealtimeEvent) => {
    handlers.forEach((handler) => {
      handler(event)
    })
  }

  function detach(target: WebSocketLike) {
    clearTimeout(idleTimer)
    target.onopen = null
    target.onclose = null
    target.onerror = null
    target.onmessage = null
  }

  /**
   * (Re)arms the watchdog. On expiry the socket is dropped right away instead of waiting for a
   * close handshake that a dead connection may never complete.
   */
  function watch(target: WebSocketLike) {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (socket !== target) return
      logger.warn(`[ws-transport] no messages for ${String(idleTimeoutMs / 1000)} s; closing`)
      detach(target)
      socket = null
      target.close(IDLE_CLOSE_CODE, 'idle timeout')
      emit({ type: 'status', status: 'closed' })
    }, idleTimeoutMs)
  }

  return {
    connect() {
      if (socket) return connecting ?? Promise.resolve()
      emit({ type: 'status', status: 'connecting' })
      const current = createSocket(url)
      socket = current

      connecting = new Promise<void>((resolve, reject) => {
        let opened = false
        current.onopen = () => {
          opened = true
          connecting = null
          emit({ type: 'status', status: 'open' })
          watch(current)
          resolve()
        }
        current.onmessage = (event) => {
          // Any frame proves the link is alive, including heartbeats consumers ignore.
          watch(current)
          if (typeof event.data !== 'string') return
          let payload: unknown
          try {
            payload = JSON.parse(event.data)
          } catch {
            logger.warn('[ws-transport] ignored non-JSON message')
            return
          }
          emit({ type: 'message', payload })
        }
        current.onerror = () => {
          // A close event always follows; it carries the outcome.
        }
        current.onclose = (event) => {
          detach(current)
          if (socket === current) socket = null
          connecting = null
          emit({ type: 'status', status: 'closed' })
          if (!opened) reject(new TransportConnectError(`WebSocket closed (${event.code})`))
        }
      })
      return connecting
    },

    disconnect() {
      const current = socket
      if (!current) return
      socket = null
      connecting = null
      detach(current)
      current.close(1000, 'client disconnect')
      emit({ type: 'status', status: 'closed' })
    },

    subscribe(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
  }
}

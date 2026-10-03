import type { RealtimeEvent, RealtimeTransport, TransportStatus } from './transport'

/** Anything that can push wire messages, e.g. the simulator. */
export interface MessageSource {
  subscribe(listener: (message: unknown) => void): () => void
  /** Optional fake network: when down, the connection drops and cannot be re-established. */
  readonly networkUp?: boolean
  subscribeNetwork?(listener: (up: boolean) => void): () => void
}

export class TransportUnavailableError extends Error {
  override name = 'TransportUnavailableError'
}

/**
 * In-process transport over a message source. Messages are deep-cloned so consumers cannot
 * share references with the source, mirroring a serialized network boundary.
 */
export function createMockRealtimeTransport(source: MessageSource): RealtimeTransport {
  const handlers = new Set<(event: RealtimeEvent) => void>()
  let unsubscribeSource: (() => void) | null = null

  function drop() {
    if (!unsubscribeSource) return
    unsubscribeSource()
    unsubscribeSource = null
    setStatus('closed')
  }

  // A network outage drops an open connection, like a WebSocket closing unexpectedly.
  source.subscribeNetwork?.((up) => {
    if (!up) drop()
  })

  function emit(event: RealtimeEvent) {
    handlers.forEach((handler) => {
      handler(event)
    })
  }

  function setStatus(status: TransportStatus) {
    emit({ type: 'status', status })
  }

  return {
    connect() {
      if (unsubscribeSource) return Promise.resolve()
      setStatus('connecting')
      if (source.networkUp === false) {
        setStatus('closed')
        return Promise.reject(new TransportUnavailableError('Realtime endpoint unreachable'))
      }
      unsubscribeSource = source.subscribe((message) => {
        emit({ type: 'message', payload: structuredClone(message) })
      })
      setStatus('open')
      return Promise.resolve()
    },
    disconnect() {
      drop()
    },
    subscribe(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
  }
}

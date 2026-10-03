import type { RealtimeEvent, RealtimeTransport, TransportStatus } from './transport'

/** Anything that can push wire messages, e.g. the simulator. */
export interface MessageSource {
  subscribe(listener: (message: unknown) => void): () => void
}

/**
 * In-process transport over a message source. Messages are deep-cloned so consumers cannot
 * share references with the source, mirroring a serialized network boundary.
 */
export function createMockRealtimeTransport(source: MessageSource): RealtimeTransport {
  const handlers = new Set<(event: RealtimeEvent) => void>()
  let unsubscribeSource: (() => void) | null = null

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
      unsubscribeSource = source.subscribe((message) => {
        emit({ type: 'message', payload: structuredClone(message) })
      })
      setStatus('open')
      return Promise.resolve()
    },
    disconnect() {
      if (!unsubscribeSource) return
      unsubscribeSource()
      unsubscribeSource = null
      setStatus('closed')
    },
    subscribe(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
  }
}

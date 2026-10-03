import { describe, expect, it } from 'vitest'
import { createMockRealtimeTransport, type MessageSource } from './mock-transport'
import type { RealtimeEvent } from './transport'

function createSource() {
  const listeners = new Set<(message: unknown) => void>()
  const source: MessageSource = {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const push = (message: unknown) => {
    listeners.forEach((listener) => {
      listener(message)
    })
  }
  return { source, push, listenerCount: () => listeners.size }
}

describe('createMockRealtimeTransport', () => {
  it('reports lifecycle and forwards messages only while connected', async () => {
    const { source, push, listenerCount } = createSource()
    const transport = createMockRealtimeTransport(source)
    const events: RealtimeEvent[] = []
    transport.subscribe((event) => events.push(event))

    push({ n: 0 })
    await transport.connect()
    push({ n: 1 })
    transport.disconnect()
    push({ n: 2 })

    expect(events).toEqual([
      { type: 'status', status: 'connecting' },
      { type: 'status', status: 'open' },
      { type: 'message', payload: { n: 1 } },
      { type: 'status', status: 'closed' },
    ])
    expect(listenerCount()).toBe(0)
  })

  it('delivers cloned payloads', async () => {
    const { source, push } = createSource()
    const transport = createMockRealtimeTransport(source)
    const original = { nested: { value: 1 } }
    let received: unknown
    transport.subscribe((event) => {
      if (event.type === 'message') received = event.payload
    })

    await transport.connect()
    push(original)

    expect(received).toEqual(original)
    expect(received).not.toBe(original)
  })

  it('drops on network outage and refuses to connect until the network is back', async () => {
    const { source } = createSource()
    let up = true
    const networkListeners = new Set<(value: boolean) => void>()
    const setNetwork = (value: boolean) => {
      up = value
      networkListeners.forEach((listener) => {
        listener(value)
      })
    }
    const transport = createMockRealtimeTransport({
      ...source,
      get networkUp() {
        return up
      },
      subscribeNetwork(listener) {
        networkListeners.add(listener)
        return () => networkListeners.delete(listener)
      },
    })
    const statuses: string[] = []
    transport.subscribe((event) => {
      if (event.type === 'status') statuses.push(event.status)
    })

    await transport.connect()
    setNetwork(false)
    await expect(transport.connect()).rejects.toThrow('unreachable')
    setNetwork(true)
    await transport.connect()

    expect(statuses).toEqual([
      'connecting',
      'open',
      'closed',
      'connecting',
      'closed',
      'connecting',
      'open',
    ])
  })
})

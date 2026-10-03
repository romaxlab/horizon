import { describe, expect, it } from 'vitest'
import { createLatestStateBuffer } from '../latest-state-buffer'

interface Sample {
  id: string
  ts: number
}

const createBuffer = () =>
  createLatestStateBuffer<Sample>({ keyOf: (s) => s.id, versionOf: (s) => s.ts })

describe('createLatestStateBuffer', () => {
  it('keeps only the latest item per key until drained', () => {
    const buffer = createBuffer()
    buffer.push({ id: 'a', ts: 1 })
    buffer.push({ id: 'a', ts: 2 })
    buffer.push({ id: 'b', ts: 1 })

    expect(buffer.drain()).toEqual([
      { id: 'a', ts: 2 },
      { id: 'b', ts: 1 },
    ])
    expect(buffer.drain()).toEqual([])
  })

  it('rejects out-of-order and duplicate items, also across drains', () => {
    const buffer = createBuffer()
    expect(buffer.push({ id: 'a', ts: 5 })).toBe(true)
    expect(buffer.push({ id: 'a', ts: 3 })).toBe(false)
    expect(buffer.push({ id: 'a', ts: 5 })).toBe(false)
    buffer.drain()

    expect(buffer.push({ id: 'a', ts: 4 })).toBe(false)
    expect(buffer.push({ id: 'a', ts: 6 })).toBe(true)
    expect(buffer.drain()).toEqual([{ id: 'a', ts: 6 }])
  })

  it('applies snapshot baselines and drops older pending items', () => {
    const buffer = createBuffer()
    buffer.push({ id: 'a', ts: 2 })
    buffer.push({ id: 'b', ts: 9 })
    buffer.setBaseline('a', 3)
    buffer.setBaseline('b', 4)

    expect(buffer.drain()).toEqual([{ id: 'b', ts: 9 }])
    expect(buffer.push({ id: 'a', ts: 3 })).toBe(false)
    expect(buffer.push({ id: 'a', ts: 4 })).toBe(true)
  })

  it('forgets versions on clear', () => {
    const buffer = createBuffer()
    buffer.push({ id: 'a', ts: 5 })
    buffer.clear()

    expect(buffer.pendingCount).toBe(0)
    expect(buffer.push({ id: 'a', ts: 1 })).toBe(true)
  })
})

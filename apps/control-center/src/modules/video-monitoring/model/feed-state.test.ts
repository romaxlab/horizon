import { describe, expect, it } from 'vitest'
import { deriveFeedState } from './feed-state'

describe('deriveFeedState', () => {
  it('maps source and link to feed states', () => {
    const base = { status: 'success', available: true, link: 'live' } as const
    expect(deriveFeedState(base)).toBe('live')
    expect(deriveFeedState({ ...base, link: 'stale' })).toBe('frozen')
    expect(deriveFeedState({ ...base, link: 'offline' })).toBe('unavailable')
    expect(deriveFeedState({ ...base, available: false })).toBe('unavailable')
    expect(deriveFeedState({ ...base, status: 'pending' })).toBe('loading')
    expect(deriveFeedState({ ...base, status: 'error' })).toBe('error')
  })
})

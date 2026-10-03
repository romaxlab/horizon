import { describe, expect, it } from 'vitest'
import { formatAge, formatCardinal } from './format'

describe('formatAge', () => {
  it('formats compact relative ages', () => {
    expect(formatAge(500)).toBe('now')
    expect(formatAge(12_400)).toBe('12s ago')
    expect(formatAge(185_000)).toBe('3m ago')
    expect(formatAge(2 * 3_600_000 + 5)).toBe('2h ago')
    expect(formatAge(-1_000)).toBe('now')
  })
})

describe('formatCardinal', () => {
  it('maps headings to 8-point compass labels', () => {
    expect(formatCardinal(0)).toBe('N')
    expect(formatCardinal(44)).toBe('NE')
    expect(formatCardinal(181)).toBe('S')
    expect(formatCardinal(320.7)).toBe('NW')
    expect(formatCardinal(359)).toBe('N')
    expect(formatCardinal(-90)).toBe('W')
  })
})

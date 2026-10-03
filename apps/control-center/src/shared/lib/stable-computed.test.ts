import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { shallowEqual, stableComputed } from './stable-computed'

describe('stableComputed', () => {
  it('keeps the previous object while the value is equal', () => {
    const source = ref(1)
    const label = stableComputed(() => ({ text: source.value > 5 ? 'big' : 'small' }), shallowEqual)
    const first = label.value
    source.value = 2
    expect(label.value).toBe(first)
    source.value = 9
    expect(label.value).toEqual({ text: 'big' })
    expect(label.value).not.toBe(first)
  })
})

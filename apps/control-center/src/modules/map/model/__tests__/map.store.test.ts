import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMapStore } from '../map.store'

describe('map arrival', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts settled with content visible', () => {
    const map = useMapStore()
    expect(map.arrival).toEqual({ stage: 'settled', cut: false })
    expect(map.contentHidden).toBe(false)
  })

  it('holds in orbit with content hidden, flies in, then reveals and settles in place', () => {
    const map = useMapStore()
    map.holdArrival()
    expect(map.arrival.stage).toBe('held')
    expect(map.contentHidden).toBe(true)

    map.flyIn(2_000)
    expect(map.arrival).toEqual({ stage: 'flying', durationMs: 2_000 })
    map.revealContent()
    expect(map.contentHidden).toBe(false)

    // A landed flight settles without moving the camera again.
    map.settleArrival()
    expect(map.arrival).toEqual({ stage: 'settled', cut: false })
  })

  it('a cut arrival jumps home once; settling again changes nothing', () => {
    const map = useMapStore()
    map.holdArrival()
    map.settleArrival(true)
    expect(map.arrival).toEqual({ stage: 'settled', cut: true })
    const settled = map.arrival
    map.settleArrival()
    expect(map.arrival).toBe(settled)
  })
})

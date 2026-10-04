import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useMapStore } from '@/modules/map'
import { stageStartup } from '../startup-stage'
import { CINEMATIC_TIMELINE as T, REVEAL_GROUPS } from '../startup-timeline'
import { useStartupSequence } from '../useStartupSequence'

/** The page state the sequence writes (`<html data-startup>` and its CSS variables). */
const html = {
  dataset: {} as Record<string, string | undefined>,
  style: { setProperty: vi.fn(), removeProperty: vi.fn() },
}

const telemetry = ref(true)
const fleet = ref(true)
const mapReady = ref(true)
let pinia: Pinia

function start() {
  stageStartup(pinia)
  const scope = effectScope()
  const sequence = scope.run(() =>
    useStartupSequence({
      status: { app: () => true, telemetry: () => telemetry.value, fleet: () => fleet.value },
      mapReady: () => mapReady.value,
    }),
  )
  if (!sequence) throw new Error('sequence not created')
  return {
    sequence,
    map: useMapStore(),
    dispose: () => {
      scope.stop()
    },
  }
}

const lastLineConfirmedAt = T.status.at + 2 * T.status.interval + T.status.confirmAfter
const revealAt = T.dissolve.at + T.reveal.offset
const doneAt = revealAt + T.reveal.duration + (REVEAL_GROUPS - 1) * T.reveal.stagger

describe('useStartupSequence', () => {
  beforeEach(() => {
    // The sequence measures elapsed time with performance.now(); fake it with the timers.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
    })
    vi.stubGlobal('document', { documentElement: html })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    html.dataset = {}
    telemetry.value = fleet.value = mapReady.value = true
    pinia = createPinia()
    setActivePinia(pinia)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('runs intro → dissolve with the camera fly-in → staged reveal → done, leaving no trace', async () => {
    const { sequence, map } = start()
    expect(html.dataset.startup).toBe('staged')
    expect(map.arrival.stage).toBe('held')
    expect(map.contentHidden).toBe(true)
    expect(sequence.blocking.value).toBe(true)

    await vi.advanceTimersByTimeAsync(T.dissolve.at)
    expect(sequence.phase.value).toBe('dissolving')
    // A 0 ms timer fires after 1 ms (Node semantics, kept by fake timers).
    await vi.advanceTimersByTimeAsync(T.flyIn.offset + 1)
    expect(map.arrival).toEqual({ stage: 'flying', durationMs: T.flyIn.duration })

    await vi.advanceTimersByTimeAsync(T.reveal.offset - T.flyIn.offset)
    expect(sequence.phase.value).toBe('revealing')
    expect(sequence.blocking.value).toBe(false)
    expect(html.dataset.startup).toBe('revealing')
    expect(map.contentHidden).toBe(false)

    await vi.advanceTimersByTimeAsync(doneAt - revealAt)
    expect(sequence.phase.value).toBe('done')
    expect(html.dataset.startup).toBeUndefined()
    // Landed: the camera is left where it is (the user may already be moving it).
    expect(map.arrival).toEqual({ stage: 'settled', cut: false })
  })

  it('confirms a status line only once its real signal is true', async () => {
    telemetry.value = false
    const { sequence } = start()
    await vi.advanceTimersByTimeAsync(lastLineConfirmedAt)

    const [app, link, synced] = sequence.lines.value
    expect(app).toMatchObject({ shown: true, confirmed: true })
    expect(link).toMatchObject({ label: 'Connecting telemetry', shown: true, confirmed: false })
    expect(synced?.confirmed).toBe(true)

    telemetry.value = true
    expect(sequence.lines.value[1]?.confirmed).toBe(true)
  })

  it('hands over once the map and the signals are ready, within the bound', async () => {
    mapReady.value = false
    fleet.value = false
    const { sequence } = start()

    await vi.advanceTimersByTimeAsync(T.dissolve.at + 500)
    expect(sequence.phase.value).toBe('intro')

    mapReady.value = true
    fleet.value = true
    await vi.advanceTimersByTimeAsync(0)
    expect(sequence.phase.value).toBe('dissolving')
  })

  it('never holds the app longer than the bound; unready lines stay unconfirmed', async () => {
    fleet.value = false
    const { sequence } = start()

    await vi.advanceTimersByTimeAsync(T.dissolve.at + T.dissolve.maxReadyWait - 1)
    expect(sequence.phase.value).toBe('intro')
    await vi.advanceTimersByTimeAsync(1)
    expect(sequence.phase.value).toBe('dissolving')
    expect(sequence.lines.value[2]).toMatchObject({ shown: true, confirmed: false })
  })

  it('skip lands the camera and the panels at once and finishes after the short fade', async () => {
    const { sequence, map } = start()
    await vi.advanceTimersByTimeAsync(1_000)

    sequence.skip()
    expect(map.arrival).toEqual({ stage: 'settled', cut: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(sequence.phase.value).toBe('revealing')
    expect(map.contentHidden).toBe(false)

    await vi.advanceTimersByTimeAsync(T.skip.duration)
    expect(sequence.phase.value).toBe('done')
    expect(html.dataset.startup).toBeUndefined()

    // The cancelled timeline never fires afterwards.
    await vi.advanceTimersByTimeAsync(doneAt)
    expect(map.arrival).toEqual({ stage: 'settled', cut: true })
  })

  it('disposed mid-sequence (e.g. unmounted): lands in the final state, nothing fires later', async () => {
    const { sequence, map, dispose } = start()
    await vi.advanceTimersByTimeAsync(T.dissolve.at + 100)

    dispose()
    expect(sequence.phase.value).toBe('done')
    expect(html.dataset.startup).toBeUndefined()
    expect(map.contentHidden).toBe(false)
    expect(map.arrival).toEqual({ stage: 'settled', cut: true })

    await vi.advanceTimersByTimeAsync(doneAt)
    expect(html.dataset.startup).toBeUndefined()
    expect(sequence.phase.value).toBe('done')
  })
})

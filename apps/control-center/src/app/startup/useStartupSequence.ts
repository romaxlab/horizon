import { nextTick, onBeforeUnmount, readonly, ref, watch } from 'vue'
import { useMapStore } from '@/modules/map'
import {
  CINEMATIC_TIMELINE,
  REDUCED_MOTION_TIMELINE,
  STARTUP_STATUS_LINES,
  type StartupTimeline,
} from './startup-timeline'

/**
 * - `intro`: the overlay (logo, status lines) covers the app;
 * - `dissolving`: the overlay fades into the map while the camera flies in;
 * - `revealing`: panels and map content appear, staggered;
 * - `done`: the normal Control Center; the sequence leaves no trace.
 */
export type StartupPhase = 'intro' | 'dissolving' | 'revealing' | 'done'

/** Reveal groups the Control Center marks with `data-reveal` (see startup-reveal.css). */
const REVEAL_GROUPS = 4
const REVEAL_TRAVEL_PX = 8

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Skipped or unmounted: the remaining timeline is dropped. */
class SequenceAborted extends Error {
  override name = 'SequenceAborted'
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new SequenceAborted())
      return
    }
    const timer = setTimeout(resolve, Math.max(0, ms))
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new SequenceAborted())
      },
      { once: true },
    )
  })
}

/**
 * Orchestrates the cinematic startup: a timed overlay, then the hand-over to the map (camera
 * arrival, content reveal) and a staggered reveal of the Control Center panels. It only drives
 * presentation: the app, data loading and realtime start in parallel and are never waited for.
 * Must run before the map is created (it holds the camera in orbit).
 */
export function useStartupSequence() {
  const reducedMotion = prefersReducedMotion()
  const timeline: StartupTimeline = reducedMotion ? REDUCED_MOTION_TIMELINE : CINEMATIC_TIMELINE
  const map = useMapStore()
  const root = document.documentElement

  const phase = ref<StartupPhase>('intro')
  /** Status lines shown so far, and how many of them are confirmed. */
  const statusShown = ref(0)
  const statusConfirmed = ref(0)
  const skipped = ref(false)

  function setRevealTiming(duration: number, stagger: number) {
    root.style.setProperty('--startup-reveal-duration', `${String(duration)}ms`)
    root.style.setProperty('--startup-reveal-stagger', `${String(stagger)}ms`)
  }
  root.style.setProperty('--startup-ease-enter', timeline.easing.enter)
  root.style.setProperty(
    '--startup-reveal-travel',
    `${String(reducedMotion ? 0 : REVEAL_TRAVEL_PX)}px`,
  )
  setRevealTiming(timeline.reveal.duration, timeline.reveal.stagger)
  root.dataset.startup = 'staged'
  map.holdArrival()

  const abort = new AbortController()
  const { signal } = abort
  const statusTimers: ReturnType<typeof setTimeout>[] = []

  /** The overlay may hand over once the map scene exists (Cesium loads on demand), or after a
   *  bounded wait: a slow map never holds the app behind the intro. */
  function mapReadyOrTimeout(maxWait: number): Promise<void> {
    if (map.sceneReady) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const stop = watch(
        () => map.sceneReady,
        (ready) => {
          if (ready) done()
        },
      )
      const timer = setTimeout(done, maxWait)
      function done() {
        stop()
        clearTimeout(timer)
        resolve()
      }
      signal.addEventListener(
        'abort',
        () => {
          stop()
          clearTimeout(timer)
          reject(new SequenceAborted())
        },
        { once: true },
      )
    })
  }

  function reveal() {
    phase.value = 'revealing'
    root.dataset.startup = 'revealing'
    map.revealContent()
  }

  function cleanUp() {
    phase.value = 'done'
    delete root.dataset.startup
    for (const name of [
      '--startup-reveal-duration',
      '--startup-reveal-stagger',
      '--startup-reveal-travel',
      '--startup-ease-enter',
    ]) {
      root.style.removeProperty(name)
    }
  }

  async function run() {
    const startedAt = performance.now()
    const at = (ms: number) => wait(ms - (performance.now() - startedAt), signal)

    STARTUP_STATUS_LINES.forEach((_, index) => {
      const shownAt = timeline.status.at + index * timeline.status.interval
      statusTimers.push(
        setTimeout(() => (statusShown.value = index + 1), shownAt),
        setTimeout(
          () => (statusConfirmed.value = index + 1),
          shownAt + timeline.status.confirmAfter,
        ),
      )
    })

    await at(timeline.dissolve.at)
    await mapReadyOrTimeout(timeline.dissolve.maxMapWait)
    statusShown.value = statusConfirmed.value = STARTUP_STATUS_LINES.length
    phase.value = 'dissolving'

    await wait(timeline.flyIn.offset, signal)
    map.flyIn(timeline.flyIn.duration)
    await wait(timeline.reveal.offset - timeline.flyIn.offset, signal)
    reveal()

    await wait(timeline.reveal.duration + (REVEAL_GROUPS - 1) * timeline.reveal.stagger, signal)
    map.settleArrival()
    cleanUp()
  }

  run().catch((error: unknown) => {
    if (!(error instanceof SequenceAborted)) throw error
  })

  /** Skip: the overlay fades out fast; the camera and the panels land in their final state. */
  function skip() {
    if (phase.value === 'done' || skipped.value) return
    skipped.value = true
    abort.abort()
    statusTimers.forEach(clearTimeout)
    map.settleArrival(true)
    setRevealTiming(timeline.skip.duration, 0)
    // Render the short skip fade onto the overlay before it starts leaving (a leaving element
    // is no longer updated).
    void nextTick(() => {
      reveal()
      setTimeout(cleanUp, timeline.skip.duration)
    })
  }

  onBeforeUnmount(() => {
    if (phase.value === 'done') return
    abort.abort()
    statusTimers.forEach(clearTimeout)
    map.settleArrival(true)
    map.revealContent()
    cleanUp()
  })

  return {
    timeline,
    phase: readonly(phase),
    statusShown: readonly(statusShown),
    statusConfirmed: readonly(statusConfirmed),
    skipped: readonly(skipped),
    skip,
  }
}

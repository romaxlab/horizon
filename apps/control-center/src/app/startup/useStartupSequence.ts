import { computed, nextTick, onScopeDispose, readonly, ref, watch } from 'vue'
import { useMapStore } from '@/modules/map'
import { clearStartup, markRevealing, prefersReducedMotion, setRevealTiming } from './startup-stage'
import {
  REVEAL_GROUPS,
  STARTUP_STATUS_LINES,
  startupTimeline,
  type StartupSignal,
} from './startup-timeline'

/**
 * - `intro`: the overlay (logo, status lines) covers the app;
 * - `dissolving`: the overlay fades into the map while the camera flies in;
 * - `revealing`: panels and map content appear, staggered;
 * - `done`: the normal Control Center; the sequence leaves no trace.
 */
export type StartupPhase = 'intro' | 'dissolving' | 'revealing' | 'done'

export interface StartupSignals {
  /** Real readiness behind each status line; a line is never confirmed before it is true. */
  status: Record<StartupSignal, () => boolean>
  /** The map shows its first complete view. */
  mapReady: () => boolean
}

/** Skipped or disposed: the remaining timeline is dropped. */
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

/** Resolves once `ready()` is true, or after `maxWait`. */
function readyOrTimeout(ready: () => boolean, maxWait: number, signal: AbortSignal) {
  if (ready()) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const stop = watch(ready, (now) => {
      if (now) done()
    })
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

/**
 * Orchestrates the cinematic startup: a timed overlay whose status lines confirm only on real
 * signals, then the hand-over to the map (camera arrival, content reveal) and a staggered reveal
 * of the Control Center panels. Presentation only: data loading and realtime run in parallel and
 * are never waited for beyond a bounded hand-over. Expects `stageStartup` to have run.
 */
export function useStartupSequence(signals: StartupSignals) {
  const timeline = startupTimeline(prefersReducedMotion())
  const map = useMapStore()

  const phase = ref<StartupPhase>('intro')
  const skipped = ref(false)
  /** Per status line: shown, and old enough to be confirmed (if its signal is true). */
  const shown = ref(STARTUP_STATUS_LINES.map(() => false))
  const settled = ref(STARTUP_STATUS_LINES.map(() => false))

  const lines = computed(() =>
    STARTUP_STATUS_LINES.map((line, index) => ({
      label: line.label,
      shown: shown.value[index] ?? false,
      confirmed: (settled.value[index] ?? false) && signals.status[line.signal](),
    })),
  )
  const allConfirmed = () => lines.value.every((line) => line.confirmed)

  const abort = new AbortController()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  function later(ms: number, callback: () => void) {
    const timer = setTimeout(() => {
      timers.delete(timer)
      callback()
    }, ms)
    timers.add(timer)
  }
  function clearTimers() {
    timers.forEach(clearTimeout)
    timers.clear()
  }

  function reveal() {
    phase.value = 'revealing'
    markRevealing()
    map.revealContent()
  }

  function finish() {
    phase.value = 'done'
    clearStartup()
  }

  /** Lands everything in its final state at once (dispose, or a failed step). */
  function finishNow() {
    abort.abort()
    clearTimers()
    map.settleArrival(true)
    map.revealContent()
    finish()
  }

  async function run() {
    const startedAt = performance.now()
    const at = (ms: number) => wait(ms - (performance.now() - startedAt), abort.signal)

    STARTUP_STATUS_LINES.forEach((_, index) => {
      const shownAt = timeline.status.at + index * timeline.status.interval
      later(shownAt, () => (shown.value[index] = true))
      later(shownAt + timeline.status.confirmAfter, () => (settled.value[index] = true))
    })

    await at(timeline.dissolve.at)
    // Hand over once the map and the status signals are ready, never later than the bound.
    await readyOrTimeout(
      () => signals.mapReady() && allConfirmed(),
      timeline.dissolve.maxReadyWait,
      abort.signal,
    )
    shown.value = shown.value.map(() => true)
    phase.value = 'dissolving'

    await wait(timeline.flyIn.offset, abort.signal)
    map.flyIn(timeline.flyIn.duration)
    await wait(timeline.reveal.offset - timeline.flyIn.offset, abort.signal)
    reveal()

    await wait(
      timeline.reveal.duration + (REVEAL_GROUPS - 1) * timeline.reveal.stagger,
      abort.signal,
    )
    map.settleArrival()
    finish()
  }

  run().catch((error: unknown) => {
    if (error instanceof SequenceAborted) return
    // A presentation failure must never leave the app hidden behind the intro.
    console.error('[startup] sequence failed', error)
    finishNow()
  })

  /** Skip: the overlay fades out fast; the camera and the panels land in their final state. */
  function skip() {
    if (phase.value === 'done' || skipped.value) return
    skipped.value = true
    abort.abort()
    clearTimers()
    map.settleArrival(true)
    setRevealTiming(timeline.skip.duration, 0)
    // Render the short skip fade onto the overlay before it starts leaving (a leaving element
    // is no longer updated).
    void nextTick(() => {
      if (phase.value === 'done') return // disposed meanwhile
      reveal()
      later(timeline.skip.duration, finish)
    })
  }

  onScopeDispose(() => {
    if (phase.value !== 'done') finishNow()
    clearTimers()
  })

  return {
    timeline,
    phase: readonly(phase),
    lines,
    skipped: readonly(skipped),
    /** The app under the overlay takes no input until it is handed over. */
    blocking: computed(() => phase.value === 'intro' || phase.value === 'dissolving'),
    skip,
  }
}

export type StartupSequence = ReturnType<typeof useStartupSequence>

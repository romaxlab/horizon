/*
 * The startup sequence, in one place: every duration, offset and easing curve. All times are ms
 * from the start of the sequence (or from the start of a phase where noted). Tune here; the
 * orchestrator and the overlay only read these values.
 *
 *   0 ─ logo ─ title ─ status lines ─┬─ dissolve ─┐
 *                                    └─ camera fly-in ────────┬─ UI reveal ─┐ done
 */

export interface StartupTimeline {
  /** Logo resolves from blur: start and duration. */
  logo: { at: number; duration: number }
  /** "Autonomous Mission Control" and the horizon line under the logo. */
  title: { at: number; duration: number }
  /** Status lines: the first appears at `at`, each next one `interval` later; a line confirms
   *  `confirmAfter` after it appears. */
  status: { at: number; interval: number; confirmAfter: number; duration: number }
  /** Overlay dissolves into the map. Waits for the map's first complete view and the status
   *  signals, at most `maxReadyWait` longer; unconfirmed lines then stay unconfirmed. */
  dissolve: { at: number; duration: number; maxReadyWait: number }
  /** Camera fly-in from orbit; starts with the dissolve (offset from the dissolve start). */
  flyIn: { offset: number; duration: number }
  /** Panels and map content reveal, staggered; offset from the fly-in start. */
  reveal: { offset: number; stagger: number; duration: number }
  /** Skip: the overlay fades out this fast. */
  skip: { duration: number }
  easing: { enter: string; dissolve: string }
}

/** What a status line reports; it is confirmed only once that is actually true. */
export type StartupSignal = 'app' | 'telemetry' | 'fleet'

export const STARTUP_STATUS_LINES: readonly { label: string; signal: StartupSignal }[] = [
  // The app is composed (services chosen) before the intro mounts.
  { label: 'Initializing systems', signal: 'app' },
  { label: 'Connecting telemetry', signal: 'telemetry' },
  { label: 'Fleet synchronized', signal: 'fleet' },
]

/** About 5.3 s from first frame to the normal Control Center. */
export const CINEMATIC_TIMELINE: StartupTimeline = {
  logo: { at: 150, duration: 1_000 },
  title: { at: 650, duration: 800 },
  status: { at: 1_150, interval: 360, confirmAfter: 260, duration: 320 },
  dissolve: { at: 2_500, duration: 900, maxReadyWait: 2_500 },
  flyIn: { offset: 0, duration: 2_300 },
  reveal: { offset: 2_050, stagger: 90, duration: 650 },
  skip: { duration: 250 },
  easing: {
    // Long, soft deceleration for things arriving.
    enter: 'cubic-bezier(0.22, 1, 0.36, 1)',
    // Symmetric ease for the hand-over to the map.
    dissolve: 'cubic-bezier(0.65, 0, 0.35, 1)',
  },
}

/**
 * prefers-reduced-motion: the same steps, shorter and without motion: no scale, blur or
 * travel (the overlay only cross-fades) and no camera flight.
 */
export const REDUCED_MOTION_TIMELINE: StartupTimeline = {
  logo: { at: 0, duration: 200 },
  title: { at: 0, duration: 200 },
  status: { at: 250, interval: 200, confirmAfter: 120, duration: 150 },
  dissolve: { at: 1_000, duration: 300, maxReadyWait: 1_500 },
  flyIn: { offset: 0, duration: 0 },
  reveal: { offset: 300, stagger: 0, duration: 200 },
  skip: { duration: 0 },
  easing: { enter: 'ease-out', dissolve: 'ease-in-out' },
}

/** Staggered reveal groups the Control Center marks with `data-reveal="0…3"`. */
export const REVEAL_GROUPS = 4

export const startupTimeline = (reducedMotion: boolean): StartupTimeline =>
  reducedMotion ? REDUCED_MOTION_TIMELINE : CINEMATIC_TIMELINE

import { describe, expect, it } from 'vitest'
import {
  CINEMATIC_TIMELINE,
  REDUCED_MOTION_TIMELINE,
  STARTUP_STATUS_LINES,
  type StartupTimeline,
} from '../startup-timeline'

/** Last reveal group (see `data-reveal` in the Control Center). */
const LAST_REVEAL_GROUP = 3

/** First frame → normal Control Center, when the map is ready in time. */
function totalMs(t: StartupTimeline) {
  return t.dissolve.at + t.reveal.offset + t.reveal.duration + LAST_REVEAL_GROUP * t.reveal.stagger
}

describe('startup timeline', () => {
  it('takes about 4–6 seconds', () => {
    expect(totalMs(CINEMATIC_TIMELINE)).toBeGreaterThanOrEqual(4_000)
    expect(totalMs(CINEMATIC_TIMELINE)).toBeLessThanOrEqual(6_000)
  })

  it.each([
    ['cinematic', CINEMATIC_TIMELINE],
    ['reduced motion', REDUCED_MOTION_TIMELINE],
  ])('%s: confirms every status line before the overlay dissolves', (_, t) => {
    const lastConfirmed =
      t.status.at + (STARTUP_STATUS_LINES.length - 1) * t.status.interval + t.status.confirmAfter
    expect(lastConfirmed).toBeLessThanOrEqual(t.dissolve.at)
    expect(t.title.at).toBeGreaterThanOrEqual(t.logo.at)
  })

  it('reveals the panels once the camera is close to landing, before it stops', () => {
    const { flyIn, reveal } = CINEMATIC_TIMELINE
    expect(reveal.offset).toBeGreaterThan(flyIn.offset + flyIn.duration * 0.75)
    expect(reveal.offset).toBeLessThan(flyIn.offset + flyIn.duration)
  })

  it('reduced motion is shorter and has no camera flight', () => {
    expect(REDUCED_MOTION_TIMELINE.flyIn.duration).toBe(0)
    expect(REDUCED_MOTION_TIMELINE.reveal.stagger).toBe(0)
    expect(totalMs(REDUCED_MOTION_TIMELINE)).toBeLessThan(totalMs(CINEMATIC_TIMELINE) / 2)
  })
})

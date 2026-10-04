import type { Pinia } from 'pinia'
import { useMapStore } from '@/modules/map'
import { startupTimeline } from './startup-timeline'

/*
 * The page-level state of the startup sequence: `<html data-startup>` plus the reveal timing
 * variables read by startup-reveal.css. Everything that touches the document lives here.
 */

const REVEAL_TRAVEL_PX = 8
const VARIABLES = [
  '--startup-reveal-duration',
  '--startup-reveal-stagger',
  '--startup-reveal-travel',
  '--startup-ease-enter',
] as const

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const root = () => document.documentElement

/**
 * Bootstrap step, before the app mounts: the panels start hidden and the map starts held in
 * orbit. Explicit, so nothing depends on which component happens to set up first.
 */
export function stageStartup(pinia: Pinia) {
  const reducedMotion = prefersReducedMotion()
  const timeline = startupTimeline(reducedMotion)
  const { style, dataset } = root()
  style.setProperty('--startup-ease-enter', timeline.easing.enter)
  style.setProperty('--startup-reveal-travel', `${String(reducedMotion ? 0 : REVEAL_TRAVEL_PX)}px`)
  setRevealTiming(timeline.reveal.duration, timeline.reveal.stagger)
  dataset.startup = 'staged'
  useMapStore(pinia).holdArrival()
}

export function setRevealTiming(duration: number, stagger: number) {
  root().style.setProperty('--startup-reveal-duration', `${String(duration)}ms`)
  root().style.setProperty('--startup-reveal-stagger', `${String(stagger)}ms`)
}

/** Panels animate into place (staggered by group). */
export function markRevealing() {
  root().dataset.startup = 'revealing'
}

/** Leaves no trace: the Control Center is in its normal state. */
export function clearStartup() {
  delete root().dataset.startup
  for (const name of VARIABLES) root().style.removeProperty(name)
}

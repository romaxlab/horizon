import type { UavState } from '@horizon/domain'

export type FleetChange = { kind: 'reset' } | { kind: 'update'; changed: readonly UavState[] }

/**
 * Fleet state as a stream for high-frequency consumers (the map). Bypasses component rendering:
 * the map applies deltas directly instead of re-rendering on every telemetry flush.
 */
export interface FleetFeed {
  current(): readonly UavState[]
  subscribe(listener: (change: FleetChange) => void): () => void
}

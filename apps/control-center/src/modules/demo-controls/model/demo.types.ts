export type DemoPreset = 'normal' | 'incident' | 'stress'

/** Reversible failures that can be injected on one UAV. */
export type DemoInjection = 'lowBattery' | 'signalDegraded' | 'telemetryLost' | 'geofenceBreach'

export type DemoInjections = Record<DemoInjection, boolean>

/** Operator-facing demo commands; implementations forward them to the simulated backend. */
export type DemoCommand =
  | { type: 'preset'; preset: DemoPreset }
  | { type: 'setInjection'; uavId: string; injection: DemoInjection; active: boolean }
  | { type: 'setNetwork'; up: boolean }
  | { type: 'restoreAll' }
  | { type: 'completeMission' }
  | { type: 'reset' }
  | { type: 'setTimeScale'; scale: number }

export interface DemoCommandResult {
  ok: boolean
  reason?: string
  /** The backend state was replaced (preset/reset); the client should resync. */
  resync: boolean
}

/**
 * Demo/diagnostics boundary. Only the mock composition provides it, and only when enabled by
 * config. It talks to the simulator; it never touches application stores.
 */
export interface DemoControl {
  dispatch(command: DemoCommand): DemoCommandResult
  readonly timeScale: number
  /** Failures currently injected on a UAV (null for an unknown UAV). */
  injections(uavId: string): DemoInjections | null
  /** Whether the simulated backend is reachable (false during a network outage). */
  readonly networkUp: boolean
  /** Nothing to reset: no mission, no injected failures, backend reachable. */
  readonly pristine: boolean
}

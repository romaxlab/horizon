export type DemoPreset = 'normal' | 'incident' | 'stress'

/** Operator-facing demo commands; implementations forward them to the simulated backend. */
export type DemoCommand =
  | { type: 'preset'; preset: DemoPreset }
  | { type: 'lowBattery'; uavId: string }
  | { type: 'degradeSignal'; uavId: string }
  | { type: 'loseTelemetry'; uavId: string }
  | { type: 'breachGeofence'; uavId: string }
  | { type: 'networkOutage' }
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
}

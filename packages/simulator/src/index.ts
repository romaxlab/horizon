export { AreaScanError, planAreaScan, type AreaScanRequest } from './area-scan'
export { DEMO_BASE, DEMO_FLEET_SIZE, DEMO_MISSION } from './demo'
export type { FleetSnapshotDto, SimulatorMessage, TelemetryDto, UavDto } from './protocol'
export {
  createSimulator,
  type CommandResult,
  type Simulator,
  type SimulatorCommand,
  type SimulatorMode,
  type SimulatorOptions,
} from './simulator'

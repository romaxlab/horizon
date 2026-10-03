export { AreaScanError, planAreaScan, type AreaScanRequest } from './area-scan'
export { DEMO_BASE, DEMO_FLEET_SIZE, DEMO_MISSION, DEMO_PARKING } from './demo'
export type {
  FleetSnapshotDto,
  GeoPointDto,
  MissionDto,
  MissionPlanRequestDto,
  MissionStatusDto,
  RouteDto,
  SimulatorMessage,
  TelemetryDto,
  UavDto,
  WaypointDto,
} from './protocol'
export {
  createSimulator,
  type CommandResult,
  type PlanResult,
  type Simulator,
  type SimulatorCommand,
  type SimulatorMode,
  type SimulatorOptions,
} from './simulator'

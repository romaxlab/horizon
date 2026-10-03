export { AreaScanError, planAreaScan, type AreaScanRequest } from './area-scan'
export {
  DEMO_BASE,
  DEMO_FLEET_SIZE,
  DEMO_GEOFENCES,
  DEMO_MISSION,
  DEMO_PARKING,
  STRESS_FLEET_SIZE,
  type DemoPreset,
} from './demo'
export type {
  FleetSnapshotDto,
  GeofenceDto,
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
  type UavInjections,
} from './simulator'

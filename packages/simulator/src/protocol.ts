/*
 * Wire format produced by the simulator, i.e. what a real backend would send.
 * Field names intentionally follow backend (snake_case) conventions; the application
 * validates and maps these payloads and never imports these types.
 */

export interface UavDto {
  id: string
  name: string
  model: string
  callsign: string
  has_camera: boolean
  has_thermal_camera: boolean
}

export interface TelemetryDto {
  uav_id: string
  /** Epoch milliseconds. */
  ts: number
  lat: number
  lon: number
  alt_m: number
  speed_mps: number
  heading_deg: number
  battery_pct: number
  signal_pct: number
  gps_sats: number
  mission_id: string | null
  waypoint_index: number | null
  flight_phase: 'parked' | 'mission' | 'returning'
  /** Why a returning UAV is heading home; null otherwise. */
  return_reason: 'completed' | 'aborted' | 'low-battery' | null
  /**
   * Estimated battery on landing if the UAV flies the rest of its route and returns home;
   * null while parked.
   */
  landing_battery_pct: number | null
}

export interface FleetSnapshotDto {
  server_time: number
  uavs: UavDto[]
  telemetry: TelemetryDto[]
}

export interface GeoPointDto {
  lat: number
  lon: number
}

export interface WaypointDto {
  id: string
  lat: number
  lon: number
  alt_m: number
  order: number
}

export interface RouteDto {
  uav_id: string
  /** Departure and landing point. */
  home: GeoPointDto
  waypoints: WaypointDto[]
  /** Waypoint indexes of the task (before `task_start`: transit from the base). */
  task_start: number
  task_end: number
  /** Waypoints per lap/orbit; null when the task has no laps. */
  lap_size: number | null
  distance_m: number
  eta_s: number
}

export type MissionTypeDto = 'area_scan' | 'patrol' | 'point_inspection'

export type MissionStatusDto = 'planned' | 'active' | 'completed' | 'aborted'

export interface MissionDto {
  id: string
  name: string
  type: MissionTypeDto
  status: MissionStatusDto
  area: { polygon: GeoPointDto[] }
  altitude_m: number
  /** Patrol circuits or inspection orbits; null for an area scan. */
  laps: number | null
  /** Point inspection: the inspected point and orbit radius; null for other types. */
  target: GeoPointDto | null
  radius_m: number | null
  assigned_uav_ids: string[]
  routes: RouteDto[]
  created_at: number
  started_at: number | null
  completed_at: number | null
}

export interface GeofenceDto {
  id: string
  name: string
  polygon: GeoPointDto[]
}

/**
 * Fake REST: POST /missions/plan body. `area` holds the scan area, the patrol loop, or the single
 * inspection target. The planned mission's area for an inspection is its orbit loop.
 */
export interface MissionPlanRequestDto {
  name: string
  type: MissionTypeDto
  area: { polygon: GeoPointDto[] }
  altitude_m: number
  uav_count: number
  /** Patrol circuits or inspection orbits. */
  laps?: number
  /** Point inspection only: orbit radius. */
  radius_m?: number
}

export type SimulatorMessage =
  | { type: 'telemetry'; data: TelemetryDto }
  | { type: 'mission'; data: MissionDto }
  /** Link liveness beat, sent every few seconds even when nothing else changes. */
  | { type: 'heartbeat'; data: { server_time: number } }

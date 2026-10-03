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
}

export interface FleetSnapshotDto {
  server_time: number
  uavs: UavDto[]
  telemetry: TelemetryDto[]
}

export type SimulatorMessage = { type: 'telemetry'; data: TelemetryDto }

import type { Uav, UavTelemetry } from '@horizon/domain'
import type { FleetSnapshot } from '../model/fleet.types'
import type { FleetSnapshotDto, TelemetryDto, UavDto } from './fleet.schema'

export function mapUav(dto: UavDto): Uav {
  return {
    id: dto.id,
    name: dto.name,
    model: dto.model,
    callsign: dto.callsign,
    capabilities: { camera: dto.has_camera, thermalCamera: dto.has_thermal_camera },
  }
}

export function mapTelemetry(dto: TelemetryDto): UavTelemetry {
  return {
    uavId: dto.uav_id,
    timestamp: dto.ts,
    position: { latitude: dto.lat, longitude: dto.lon, altitude: dto.alt_m },
    speed: dto.speed_mps,
    heading: dto.heading_deg,
    battery: dto.battery_pct,
    signal: dto.signal_pct,
    gpsSatellites: dto.gps_sats,
    missionId: dto.mission_id,
    currentWaypoint: dto.waypoint_index,
    flightPhase: dto.flight_phase,
    returnReason: dto.return_reason,
    landingBattery: dto.landing_battery_pct ?? null,
  }
}

export function mapFleetSnapshot(dto: FleetSnapshotDto): FleetSnapshot {
  return {
    serverTime: dto.server_time,
    uavs: dto.uavs.map(mapUav),
    telemetry: dto.telemetry.map(mapTelemetry),
  }
}

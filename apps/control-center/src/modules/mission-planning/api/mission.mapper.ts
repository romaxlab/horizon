import type { Mission, MissionArea } from '@horizon/domain'
import type { MissionPlanRequest } from '../model/mission.types'
import type { MissionDto } from './mission.schema'

export function mapMission(dto: MissionDto): Mission {
  return {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    status: dto.status,
    area: { polygon: dto.area.polygon.map(({ lat, lon }) => ({ latitude: lat, longitude: lon })) },
    altitude: dto.altitude_m,
    laps: dto.laps ?? null,
    assignedUavIds: dto.assigned_uav_ids,
    routes: dto.routes.map((route) => ({
      uavId: route.uav_id,
      home: route.home ? { latitude: route.home.lat, longitude: route.home.lon } : null,
      waypoints: route.waypoints.map((w) => ({
        id: w.id,
        latitude: w.lat,
        longitude: w.lon,
        altitude: w.alt_m,
        order: w.order,
      })),
      distanceMeters: route.distance_m,
      estimatedDurationSec: route.eta_s,
    })),
    createdAt: dto.created_at,
    startedAt: dto.started_at,
    completedAt: dto.completed_at,
  }
}

const toAreaDto = (area: MissionArea) => ({
  polygon: area.polygon.map(({ latitude, longitude }) => ({ lat: latitude, lon: longitude })),
})

/** Request body for the planning endpoint. */
export function toPlanRequestDto(request: MissionPlanRequest) {
  return {
    name: request.name,
    type: request.type,
    area: toAreaDto(request.area),
    altitude_m: request.altitude,
    uav_count: request.uavCount,
    ...(request.type === 'patrol' ? { laps: request.laps } : {}),
  }
}

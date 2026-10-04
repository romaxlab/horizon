import { polygonsOverlap, type Geofence, type GeoPoint, type GeoPosition } from '@horizon/domain'
import type { AirspaceRouter } from './airspace-routing'
import { planAreaScan } from './area-scan'
import { CRUISE_SPEED_MPS } from './flight'
import { INSPECTION_RADIUS_RANGE, orbitLoop } from './inspection'
import { planPatrol } from './patrol'
import type { GeoPointDto, MissionDto, MissionPlanRequestDto } from './protocol'

export type PlanResult =
  | { ok: true; mission: MissionDto }
  /** `geofenceIds`: every no-fly zone the plan conflicts with, when that is the reason. */
  | { ok: false; reason: string; geofenceIds?: string[] }

/** A standby UAV the planner may assign. */
export interface PlannableUav {
  id: string
  home: GeoPosition
  battery: number
}

export interface MissionPlanInput {
  request: MissionPlanRequestDto
  id: string
  /** Standby, camera-equipped UAVs. */
  available: readonly PlannableUav[]
  geofences: readonly Geofence[]
  airspace: AirspaceRouter
  /** Fallback home for a route without an assigned UAV home. */
  base: GeoPoint
  now: number
}

const toGeoPoint = ({ lat, lon }: GeoPointDto) => ({ latitude: lat, longitude: lon })
const toDto = (p: GeoPoint): GeoPointDto => ({ lat: p.latitude, lon: p.longitude })

/**
 * Validates a plan request and builds the planned mission: assigns UAVs, lays out routes for
 * its type and reports no-fly zone conflicts. Pure: the simulator keeps the plan until launch.
 */
export function planMission({
  request,
  id,
  available,
  geofences,
  airspace,
  base,
  now,
}: MissionPlanInput): PlanResult {
  if (request.uav_count < 1) return { ok: false, reason: 'At least one UAV is required' }
  if (available.length < request.uav_count) {
    return { ok: false, reason: `Only ${available.length} standby UAVs are available` }
  }
  // Deterministic assignment: the healthiest standby UAVs first, ties by id.
  const assigned = [...available]
    .sort((a, b) => b.battery - a.battery || a.id.localeCompare(b.id))
    .slice(0, request.uav_count)
  const drawn = request.area.polygon.map(toGeoPoint)
  const inspection = request.type === 'point_inspection'
  const looped = request.type === 'patrol' || inspection
  const laps = looped ? (request.laps ?? 1) : null
  const target = inspection ? (drawn[0] ?? null) : null
  const radius = inspection ? (request.radius_m ?? 0) : null
  if (inspection) {
    if (!target || drawn.length !== 1) {
      return { ok: false, reason: 'Point inspection needs exactly one target point' }
    }
    const { min, max } = INSPECTION_RADIUS_RANGE
    if (radius === null || !(radius >= min && radius <= max)) {
      return { ok: false, reason: `Orbit radius must be ${String(min)}–${String(max)} m` }
    }
  }
  // Scan area, patrol loop, or the orbit around an inspection target.
  const area = target && radius !== null ? orbitLoop(target, radius) : drawn
  if (looped) {
    // Loop corners are flown exactly, so none may lie inside a no-fly zone.
    const zones = [...new Set(area.flatMap((point) => airspace.zonesAt(point)))]
    if (zones.length > 0) {
      const what = inspection ? 'Inspection orbit passes through' : 'Patrol route has points inside'
      return {
        ok: false,
        reason: `${what} no-fly ${zones.length === 1 ? 'zone' : 'zones'} ${zones.map((z) => `"${z.name}"`).join(', ')}`,
        geofenceIds: zones.map((z) => z.id),
      }
    }
  }
  const fleet = assigned.map((u) => ({ id: u.id, home: u.home }))
  let routes
  try {
    routes = looped
      ? planPatrol({
          loop: area,
          altitude: request.altitude_m,
          laps: laps ?? 1,
          uavs: fleet,
          cruiseSpeedMps: CRUISE_SPEED_MPS,
          airspace,
        })
      : planAreaScan({
          area: { polygon: area },
          altitude: request.altitude_m,
          uavs: fleet,
          cruiseSpeedMps: CRUISE_SPEED_MPS,
          airspace,
        })
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Planning failed' }
  }

  if (routes.every((route) => route.waypoints.length === 0)) {
    const zones = geofences.filter((z) => polygonsOverlap(area, z.polygon))
    const names = zones.map((z) => `"${z.name}"`).join(', ')
    return {
      ok: false,
      reason:
        zones.length === 0
          ? 'Mission area has nothing to scan'
          : `Mission area lies inside no-fly ${zones.length === 1 ? 'zone' : 'zones'} ${names}`,
      geofenceIds: zones.map((z) => z.id),
    }
  }

  return {
    ok: true,
    mission: {
      id,
      name: request.name,
      type: request.type,
      status: 'planned',
      area: { polygon: area.map(toDto) },
      altitude_m: request.altitude_m,
      laps,
      target: target ? toDto(target) : null,
      radius_m: radius,
      assigned_uav_ids: assigned.map((u) => u.id),
      routes: routes.map((route) => ({
        uav_id: route.uavId,
        home: toDto(route.home ?? base),
        waypoints: route.waypoints.map((w) => ({
          id: w.id,
          lat: w.latitude,
          lon: w.longitude,
          alt_m: w.altitude,
          order: w.order,
        })),
        task_start: route.taskStart,
        task_end: route.taskEnd,
        lap_size: route.lapSize,
        distance_m: route.distanceMeters,
        eta_s: route.estimatedDurationSec,
      })),
      created_at: now,
      started_at: null,
      completed_at: null,
    },
  }
}

import type { GeoPoint } from './geo'

export type MissionStatus = 'draft' | 'planned' | 'active' | 'completed' | 'aborted'

export type MissionType = 'area_scan' | 'patrol' | 'point_inspection'

/** Scan area (Area Scan), or the closed loop flown by a Patrol or around an inspection target. */
export interface MissionArea {
  polygon: GeoPoint[]
}

export interface Waypoint {
  id: string
  latitude: number
  longitude: number
  altitude: number
  order: number
}

export interface UavRoute {
  uavId: string
  /** Where the UAV departs from and lands back; null when the backend doesn't report it. */
  home: GeoPoint | null
  waypoints: Waypoint[]
  /**
   * Waypoint indexes where the mission task starts and ends; waypoints before `taskStart` are
   * transit from the base (incl. detours around no-fly zones).
   */
  taskStart: number
  taskEnd: number
  /** Waypoints per lap or orbit (patrol, inspection); null when the task has no laps. */
  lapSize: number | null
  distanceMeters: number
  estimatedDurationSec: number
}

export interface Mission {
  id: string
  name: string
  type: MissionType
  status: MissionStatus
  area: MissionArea
  /** Scan altitude, meters. */
  altitude: number
  /** Patrol circuits or inspection orbits; null for an area scan. */
  laps: number | null
  /** Point inspection: inspected point and orbit radius (meters); null for other types. */
  target: GeoPoint | null
  radiusMeters: number | null
  assignedUavIds: string[]
  routes: UavRoute[]
  createdAt: number
  startedAt: number | null
  completedAt: number | null
}

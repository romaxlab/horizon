import type { GeoPoint } from './geo'

export type MissionStatus = 'draft' | 'planned' | 'active' | 'completed' | 'aborted'

export type MissionType = 'area_scan' | 'patrol'

/** Scan area (Area Scan) or the closed patrol loop (Patrol), corners in order. */
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
  /** Patrol circuits; null for other mission types. */
  laps: number | null
  assignedUavIds: string[]
  routes: UavRoute[]
  createdAt: number
  startedAt: number | null
  completedAt: number | null
}

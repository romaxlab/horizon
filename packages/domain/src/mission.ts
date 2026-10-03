import type { GeoPoint } from './geo'

export type MissionStatus = 'draft' | 'planned' | 'active' | 'completed' | 'aborted'

export type MissionType = 'area_scan'

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
  assignedUavIds: string[]
  routes: UavRoute[]
  createdAt: number
  startedAt: number | null
  completedAt: number | null
}

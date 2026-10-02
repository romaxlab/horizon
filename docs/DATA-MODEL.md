# Data Model

## Core principles

- backend DTOs do not become UI/domain models directly;
- domain entities are framework-independent;
- current fleet state is normalized by UAV ID;
- video is separate from telemetry;
- mission state is separate from UAV status;
- events are separate from current-state storage.

## UAV

```ts
interface Uav {
  id: string
  name: string
  model: string
  callsign: string

  capabilities: {
    camera: boolean
    thermalCamera: boolean
  }
}
```

## Telemetry

```ts
interface UavTelemetry {
  uavId: string
  timestamp: number

  position: {
    latitude: number
    longitude: number
    altitude: number
  }

  speed: number
  heading: number
  battery: number
  signal: number
  gpsSatellites: number
  missionId: string | null
  currentWaypoint: number | null
}
```

## UAV operational status

```ts
type UavStatus =
  | 'standby'
  | 'active'
  | 'warning'
  | 'stale'
  | 'offline'
```

Interpretation:

- `standby` — available, not executing the active mission;
- `active` — healthy realtime telemetry;
- `warning` — operating but requires attention;
- `stale` — recent telemetry missing;
- `offline` — connection considered lost.

## Mission execution state

```ts
type MissionExecutionState =
  | 'idle'
  | 'assigned'
  | 'executing'
  | 'completed'
```

UAV status and mission execution state are independent.

## Current UAV state

```ts
interface UavState {
  uav: Uav
  telemetry: UavTelemetry | null
  status: UavStatus
  missionState: MissionExecutionState
  lastUpdatedAt: number | null
}
```

Normalized storage:

```ts
type UavsById = Record<string, UavState>
```

Selected UAV:

```ts
selectedUavId: string | null
```

Do not duplicate the selected UAV object.

## Mission

```ts
type MissionStatus =
  | 'draft'
  | 'planned'
  | 'active'
  | 'completed'
  | 'aborted'

interface Mission {
  id: string
  name: string
  type: 'area_scan'
  status: MissionStatus
  area: MissionArea
  altitude: number
  assignedUavIds: string[]
  routes: UavRoute[]
  createdAt: number
  startedAt: number | null
  completedAt: number | null
}
```

## Geo

```ts
interface GeoPoint {
  latitude: number
  longitude: number
}

interface MissionArea {
  polygon: GeoPoint[]
}
```

## Mission plan

```ts
interface MissionPlanRequest {
  missionId: string
  area: MissionArea
  altitude: number
  uavCount: number
}
```

```ts
interface MissionPlan {
  missionId: string
  assignedUavIds: string[]
  routes: UavRoute[]
  estimatedDurationSec: number
  estimatedCoveragePercent: number
}
```

## UAV route

```ts
interface Waypoint {
  id: string
  latitude: number
  longitude: number
  altitude: number
  order: number
}

interface UavRoute {
  uavId: string
  waypoints: Waypoint[]
  distanceMeters: number
  estimatedDurationSec: number
}
```

## Mission progress

```ts
interface MissionProgress {
  completedWaypoints: number
  totalWaypoints: number
  coveragePercent: number
  activeUavs: number
  estimatedRemainingSec: number
}
```

Progress should derive from mission execution where practical rather than random UI percentages.

## Events

```ts
type EventSeverity = 'info' | 'warning' | 'critical'
```

```ts
interface OperationalEvent {
  id: string
  timestamp: number
  severity: EventSeverity
  type: string
  title: string
  message: string
  uavId?: string
  missionId?: string
}
```

Initial event types:

```text
MISSION_STARTED
WAYPOINT_REACHED
LOW_BATTERY
SIGNAL_DEGRADED
TELEMETRY_STALE
CONNECTION_LOST
CONNECTION_RESTORED
MISSION_COMPLETED
```

## Video

```ts
type VideoSourceType = 'mock' | 'hls' | 'webrtc'

interface UavVideoSource {
  uavId: string
  type: VideoSourceType
  source: string
}
```

```ts
type VideoState =
  | 'loading'
  | 'live'
  | 'unavailable'
  | 'error'
```

## DTO boundary

```text
REST/WebSocket payload
↓
validation
↓
DTO
↓
mapper
↓
domain model
↓
application
```

Changing backend field names should not require changing Vue components.

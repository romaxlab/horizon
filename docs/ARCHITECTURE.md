# Architecture

## 1. Direction

Horizon uses:

> **pnpm monorepo + modular vertical slices + thin Vue UI + explicit infrastructure boundaries**

The architecture is intentionally practical.

It is not strict Feature-Sliced Design and not full Clean Architecture. The codebase uses the parts that improve ownership, testability and replaceability without creating unnecessary layers.

Core principles:

1. UI is thin.
2. Business/application logic lives outside `.vue` files.
3. External systems are isolated behind small contracts.
4. Mock and remote infrastructure use the same contracts.
5. Server state and realtime state have explicit ownership.
6. Cross-module workflows are coordinated at the route-level composition layer.
7. Modules expose public APIs through `index.ts`.
8. Abstractions are introduced only for real boundaries or multiple implementations.

---

## 2. Product architecture

The MVP is primarily one map-first operational workspace:

```text
/control-center
```

The map remains visible during the main workflows.

Primary interface regions — the map is full-bleed and panels float over it:

```text
┌────────────────────────────────────────────────────────────┐
│ ( Horizon · mission )            ( connection · time · ◐ ) │
│ ┌───────────┐                                ┌───────────┐ │
│ │ Fleet     │                                │ UAV       │ │
│ │ Panel     │        3D Cesium Map           │ Inspector │ │
│ │           │        (full-bleed)            │           │ │
│ └───────────┘                                └───────────┘ │
│                 ( Mission status capsule )                 │
└────────────────────────────────────────────────────────────┘
```

Main capabilities:

- fleet monitoring;
- 3D situational awareness;
- Area Scan mission planning;
- mission execution monitoring;
- UAV inspection;
- simulated video;
- incidents and connection recovery.

Application modes such as mission planning or incident focus remain internal state, not separate routes.

---

## 3. Workspace

```text
horizon/
├── apps/
│   └── control-center/
├── packages/
│   ├── domain/
│   ├── realtime/
│   ├── simulator/
│   └── ui/
├── docs/
├── AGENTS.md
├── README.md
├── pnpm-workspace.yaml
└── package.json
```

Initial workspace deliberately contains one application and four reusable packages.

Do not create additional packages until reuse or dependency isolation clearly justifies them.

---

## 4. Application structure

```text
apps/control-center/src/
├── app/
│   ├── bootstrap/
│   ├── providers/
│   ├── router/
│   └── App.vue
│
├── modules/
│   ├── control-center/
│   ├── map/
│   ├── fleet/
│   ├── mission-planning/
│   ├── incidents/
│   ├── video-monitoring/
│   └── demo-controls/
│
├── shared/
│   ├── config/
│   ├── http/
│   └── lib/
│
└── main.ts
```

### Naming consistency

The primary screen should be easy to locate by name:

```text
URL              /control-center
Route name       control-center
Module           modules/control-center
Root view        ControlCenterView.vue
Composable       useControlCenter.ts
```

---

## 5. Control Center composition

`modules/control-center` is the route-level composition and orchestration module.

```text
modules/control-center/
├── ui/
│   └── ControlCenterView.vue
├── model/
│   └── useControlCenter.ts
├── routes.ts
└── index.ts
```

`ControlCenterView.vue` composes:

- map;
- fleet panel;
- UAV inspector;
- mission status;
- incidents;
- demo controls when enabled.

It does not own fleet, mission, video, realtime or Cesium business logic.

Cross-module coordination belongs in `useControlCenter()` or a small helper owned by the module.

Example:

```text
Incident → Inspect UAV
        ↓
useControlCenter()
        ↓
select UAV
focus map
open inspector
video module reacts
```

---

## 6. Feature modules

Default shape:

```text
modules/fleet/
├── ui/
├── model/
├── api/        # only when needed
└── index.ts
```

### `ui/`

Vue components.

They consume dedicated composables/view-model APIs.

### `model/`

Owns module application logic:

- composables;
- Pinia store when shared state is required;
- derived selectors;
- state transitions;
- small business rules;
- Query wrappers when the module owns server data.

Prefer focused composables:

```text
useFleetPanel()
useUavInspector()
useMissionBuilder()
useMissionStatus()
useIncidentCenter()
```

Avoid one oversized `useModule()` file.

### `api/`

Used only when the module owns remote/server concerns.

May contain:

- repositories;
- DTO types;
- Zod schemas;
- mappers;
- Query keys/functions.

UI never imports DTOs.

### `index.ts`

Public module API.

Modules should not deep-import another module's implementation files.

---

## 7. Map module

Cesium is a significant application capability but does not need to be a workspace package yet.

```text
modules/map/
├── ui/
│   └── MapCanvas.vue
├── model/
│   └── useMap.ts
├── lib/
│   └── cesium/
│       ├── viewer.ts
│       ├── uav-layer.ts
│       ├── mission-layer.ts
│       ├── camera-controller.ts
│       └── interpolation.ts
└── index.ts
```

Cesium is presentation infrastructure.

Authoritative state remains in application/domain state.

Map behavior:

- UAV position uses telemetry;
- altitude is real 3D altitude;
- heading follows telemetry/course;
- movement is interpolated between samples;
- existing entities are updated rather than recreated;
- selected/warning UAVs receive stronger visual emphasis;
- labels are not shown for every UAV at every zoom level;
- explicit Follow mode is separate from normal inspection/fly-to.

---

## 8. Workspace packages

### `@horizon/domain`

Pure TypeScript models shared across boundaries:

- UAV;
- telemetry;
- mission;
- mission routes and waypoints;
- geo types;
- operational events.

Must not depend on Vue, Pinia, Tailwind, Cesium or concrete network implementations.

### `@horizon/realtime`

Owns transport-level realtime concerns:

- `RealtimeTransport`;
- WebSocket implementation;
- message validation hooks;
- latest-state buffering;
- batched flushing;
- transport connection state.

No UI.

### `@horizon/simulator`

Deterministic fake backend:

- fleet generation;
- mission execution;
- telemetry generation;
- incident scheduling;
- simulator commands;
- demo presets.

It must not import application modules.

### `@horizon/ui`

First-party design system:

- semantic tokens;
- themes;
- reusable primitives;
- variants.

It must not know about UAVs, missions, Cesium or incidents.

---

## 9. Core data model

### UAV

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

### Telemetry

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

### UAV state

```ts
type UavStatus =
  | 'standby'
  | 'active'
  | 'warning'
  | 'stale'
  | 'offline'

type MissionExecutionState =
  | 'idle'
  | 'assigned'
  | 'executing'
  | 'completed'

interface UavState {
  uav: Uav
  telemetry: UavTelemetry | null
  status: UavStatus
  missionState: MissionExecutionState
  lastUpdatedAt: number | null
}
```

Fleet state is normalized by UAV ID.

The selected UAV is stored by ID, not as a duplicated object.

### Mission

```ts
type MissionStatus =
  | 'draft'
  | 'planned'
  | 'active'
  | 'completed'
  | 'aborted'

interface GeoPoint {
  latitude: number
  longitude: number
}

interface MissionArea {
  polygon: GeoPoint[]
}

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

Mission progress should derive from route/waypoint execution where practical rather than from arbitrary percentages.

---

## 10. State ownership

### TanStack Vue Query

Owns REST/server lifecycle:

- fetch state;
- cache;
- retry;
- refetch;
- invalidation;
- mutations;
- cancellation.

### Pinia

Owns shared current realtime/client state:

- normalized current fleet;
- shared selected UAV ID;
- active mission execution state;
- realtime connection state;
- current operational incident/event state.

### Local state

Transient presentation state remains local when it is not shared:

- open menu;
- current mission-builder step;
- hovered row;
- local panel expansion;
- temporary form input.

### Query + Pinia rule

Query cache and Pinia must not become competing truths for the same live entity.

For realtime fleet state:

```text
TanStack Query loads snapshot
        ↓
hydrate/reconcile Pinia
        ↓
Pinia becomes current live UI state
        ↑
realtime updates
```

For non-realtime server data, Query cache may remain the sole source of truth.

---

## 11. HTTP boundary

TanStack Query is not an HTTP client.

Preferred flow:

```text
UI
→ composable
→ TanStack Query
→ Repository
→ HttpClient
→ native fetch
```

The small HTTP client may centralize:

- base URL;
- headers;
- JSON parsing;
- standard error mapping;
- `AbortSignal`.

Do not add Axios without a real need.

---

## 12. Realtime architecture

Transport contract:

```ts
interface RealtimeTransport {
  connect(): Promise<void>
  disconnect(): void
  subscribe(handler: (event: RealtimeEvent) => void): () => void
}
```

Implementations:

```text
MockRealtimeTransport
WebSocketRealtimeTransport
```

Pipeline:

```text
Simulator / WebSocket
→ RealtimeTransport
→ validate
→ normalize
→ latest state by UAV
→ batch flush
→ Pinia
→ Vue / Cesium
```

Incoming telemetry frequency and rendering frequency are separate concerns.

Example target:

```text
hundreds of events/sec incoming
→ keep latest event per UAV
→ flush application state around every 100 ms
```

Exact values are measured/configurable rather than hardcoded as architectural truth.

### Ordering

Out-of-order telemetry is ignored using timestamp or sequence information.

### Stale/offline

Each UAV tracks `lastUpdatedAt`.

Conceptually:

```text
fresh telemetry
→ active

short telemetry gap
→ stale

longer gap
→ offline
```

Last known position remains visible.

### Reconnect

```text
LIVE
→ RECONNECTING
→ reconnect transport
→ fetch fresh snapshot
→ reconcile current state
→ resume realtime
→ LIVE
```

The application does not assume every event was received while disconnected.

---

## 13. Infrastructure composition

Concrete infrastructure is selected once during bootstrap.

```ts
interface AppServices {
  fleetRepository: FleetRepository
  realtimeTransport: RealtimeTransport
  missionPlanner: MissionPlanner
  videoProvider: VideoProvider
}
```

Mock composition:

```text
MockFleetRepository
MockRealtimeTransport
MockMissionPlanner
MockVideoProvider
```

Future remote composition:

```text
RestFleetRepository
WebSocketRealtimeTransport
RemoteMissionPlanner
RemoteVideoProvider
```

Modules consume contracts, not concrete implementations.

Placement:

```text
FleetRepository            modules/fleet (contract owned by the consuming module)
RealtimeTransport          @horizon/realtime
AppServices + injection    app/providers/services.ts
mock composition           app/bootstrap/mock-services.ts
```

Contracts are added to `AppServices` as their features are implemented.

Configuration is validated centrally:

```text
.env
→ config validation
→ appConfig
→ bootstrap
→ concrete services
```

Only the config layer reads raw environment variables.

---

## 14. Simulator

The simulator behaves as a fake backend rather than a UI shortcut.

Baseline:

```text
24 total UAVs
6 active mission UAVs
18 standby UAVs
```

Initial state is idle: all 24 UAVs are parked in standby at the Abu Dhabi base. The prepared Area Scan mission (the baseline above) is started manually by a demo command, or automatically on startup when demo autostart is enabled through configuration.

Only one mission is active at a time. Multi-mission operation is out of MVP scope.

The simulator speaks a backend-style wire format (snake_case DTOs). The application validates and maps these payloads exactly as it would for a remote backend and never imports simulator DTO types.

Primary deterministic mission:

```text
Area Scan
6 UAVs
~120 m altitude
Abu Dhabi region
```

Modes:

```text
deterministic
random
```

Demo presets:

```text
NORMAL
INCIDENT
STRESS
```

Demo controls send commands to the simulator. They never patch application stores directly.

Example incident sequence:

```text
signal degraded
→ telemetry stale
→ connection lost
→ reconnect
→ snapshot sync
→ telemetry restored
```

A stress preset may later simulate hundreds of UAVs for performance profiling, but it is not part of the default user experience.

---

## 15. Video

Video is isolated behind:

```ts
interface VideoProvider {
  getSource(uavId: string): Promise<VideoSource | null>
}
```

Initial implementation uses prerecorded aerial footage and clearly labels it as simulated.

States:

```text
loading
live
unavailable
error
```

Video failure must not break telemetry, map state or the rest of the inspector.

Future HLS/WebRTC implementations should fit behind the same provider boundary.

---

## 16. Operational events

Severity:

```text
info
warning
critical
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

Event behavior:

- info → event history/feed;
- warning → subtle alert + history;
- critical → prominent alert with an action.

Incident actions should update/focus the real application state rather than remain disconnected log entries.

---

## 17. Testing

Testing focuses on behavior and boundaries.

Tooling:

```text
Vitest
Vue Test Utils
Playwright
```

Priority unit/integration coverage:

- telemetry validation and normalization;
- out-of-order message handling;
- stale/offline rules;
- reconnect transitions;
- mission progress;
- DTO/domain mappers;
- deterministic mission planner;
- simulator determinism.

Primary E2E flows:

```text
Create mission
→ generate plan
→ launch
→ observe execution
```

```text
Select UAV
→ inspector opens
→ telemetry/video shown
```

```text
simulate connection loss
→ stale/offline
→ reconnect
→ state restored
```

---

## 18. Technology choices

Initial runtime dependencies:

```text
Vue 3
TypeScript
Vite
Vue Router
Pinia
@tanstack/vue-query
CesiumJS
Zod
class-variance-authority
```

Styling:

```text
TailwindCSS
CSS-variable design tokens
first-party UI primitives
```

Deliberately not required initially:

```text
Nuxt
Turborepo
Nx
Axios
RxJS
Storybook
Husky
general-purpose UI libraries
SCSS architecture
```

Introduce additional tooling only when a concrete requirement appears.

---

## 19. Architecture smells

Avoid:

- direct API calls from `.vue`;
- direct WebSocket use from `.vue`;
- domain/business rules embedded in templates/components;
- DTOs leaking into UI;
- duplicate live state in Query and Pinia;
- circular module imports;
- module deep imports;
- Cesium entities treated as domain state;
- simulator-only paths that bypass normal contracts;
- one giant composable per feature;
- workspace packages created only to make the monorepo look larger.

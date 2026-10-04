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
- mission planning: Area Scan, Patrol and Point Inspection;
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

Small screens (below `sm`, 640 px) keep the same composition: one panel at a time at full width
(the inspector replaces the fleet list), the fleet list starts collapsed so the map shows first,
the bottom row wraps (status bar on its own line, phase counts in its details popover), the
clock is hidden, and popovers never exceed the screen width.

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
│   ├── MapCanvas.vue        # mounts the scene; props in, `select` out
│   └── MapControls.vue      # Follow / Reset view
├── model/
│   └── map.store.ts         # camera intents (follow, focus, reset)
├── lib/
│   ├── interpolation.ts     # Cesium-free pose interpolation (unit tested)
│   └── cesium/
│       ├── map-scene.ts     # viewer, basemap, picking; lazy-loaded chunk
│       ├── uav-layer.ts
│       ├── mission-layer.ts # with mission planning
│       ├── camera-controller.ts
│       └── palette.ts       # Cesium colors resolved from design tokens
└── index.ts
```

The map receives fleet state and the selected UAV id as props and reports picks; it does not
import the fleet module. Cesium is loaded on demand so the shell renders before the 3D engine.

Map controls have two independent settings:

```text
Map / Satellite   segmented control; Esri Canvas light/dark gray (follows the theme) or
                  Esri World Imagery
2D / 3D           single button above Follow / Reset view; top-down or tilted, both keyless
```

With `VITE_CESIUM_ION_TOKEN` (Cesium ion Community account) the 3D perspective adds buildings:

```text
3D + Satellite   Google Photorealistic 3D Tiles via Cesium ion (no Google key or billing)
                 → fallback: Cesium World Terrain + Cesium OSM Buildings
3D + Map         Cesium World Terrain + Cesium OSM Buildings
                 → if nothing loads: the keyless tilted view stays
```

Switching perspective re-pitches the camera around the point at the screen center; basemaps
cross-fade once incoming tiles are ready. The token goes in `apps/control-center/.env.local`,
which is git-ignored. Attribution is always shown, including the Cesium ion logo whenever ion is
used. Esri basemaps are free for development and demos; production use requires an ArcGIS account
or another provider. Google tiles may only be used with the Google geocoder; Horizon uses no
geocoder.

Telemetry altitude is above ground level. On terrain or 3D tiles the map samples the ground height
once at the operating site and lifts UAVs by it; the operating area is assumed flat.

Rendering runs at device resolution (capped at 2×). UAV markers use the Horizon UAV artwork
(`apps/control-center/public/assets/uav/uav-{standby,active,warning,offline}.svg`, 28 px,
nose-up, shared center, ≈1 px dark outline so they read on light buildings, sand and satellite),
loaded by URL and rotated to the compass heading; the artwork carries its own colors (standby light
gray, active cyan, warning amber, offline red), so no tint is
applied. Stale UAVs use the warning artwork; offline UAVs (last known position) use
the red offline artwork, matching their danger status in the fleet list. Selection only adds a 1.5 px ring
(`--map-marker-selection`) and the name label: marker and trail keep their status colors, so
selecting a UAV never looks like a state change. Trails and routes are drawn quieter than the
markers. Name labels (compact pills) appear only
for the selected and the hovered UAV.

Decluttering (`lib/declutter.ts`, `lib/cesium/cluster-layer.ts`):

```text
camera < 1.2 km from a UAV   always an individual marker
further out                  agglomerative screen-space clustering: the closest groups merge
                             while closer than 44 px, so splits follow natural gaps and clusters
                             break up gradually as the camera zooms in
parking formation            standby UAVs aggregate or split as one unit: a single badge while
                             neighbours would crowd, otherwise the full even grid
```

No two badges or markers end up closer than the threshold, so they never overlap. Badges are
neutral with the count inside; only warning/offline members add a colored ring. Clicking a badge
zooms in until its UAVs separate. The selected UAV is never clustered. Standby UAVs park in an
even 6 × 4 grid on the pitch of the football stadium used as the base (15 m spacing, aligned
with the pitch's long axis, all facing the same way).

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

Camera follow is one shared state (`followUavId` in the map store), toggled from the UAV
inspector — a UAV action; the map controls keep camera-wide actions only (2D/3D, Reset view,
imagery). Following tracks the
selected UAV, moves with the selection, stops when nothing is selected or on Reset view, and
survives 2D/3D switches (top-down offset in 2D, behind-and-above in 3D). When the camera drops
tracking on its own (zooming into a cluster), it reports back so the state never claims a follow
the camera isn't doing.

Attribution shows "Powered by Esri" plus each basemap's text exactly as the Esri service
publishes it (`copyrightText`), on a flat glass strip above the map controls in the bottom row.

Camera framing respects the floating panels: the layout reports the map area they leave free
(the column between the side panels, below the header and above the bottom bar) as viewport
insets, and the camera places home, "Center on map", cluster zoom and the followed UAV in the
middle of that area. Only the look-at point is shifted — the projection stays centered — so
picking (selection, area drawing) is unaffected. Follow is a per-frame look-at that keeps the
user's zoom and orbit.

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
  type: 'area_scan' | 'patrol' | 'point_inspection'
  status: MissionStatus
  /** Scan area, or the closed loop flown by a patrol or around an inspection target. */
  area: MissionArea
  altitude: number
  /** Patrol circuits or inspection orbits; null for an area scan. */
  laps: number | null
  /** Point inspection: inspected point and orbit radius; null for other types. */
  target: GeoPoint | null
  radiusMeters: number | null
  assignedUavIds: string[]
  routes: UavRoute[]
  createdAt: number
  startedAt: number | null
  completedAt: number | null
}
```

Mission progress should derive from route/waypoint execution where practical rather than from arbitrary percentages.

Progress is the share of the planned flight distance covered — transit from the base, the mission
route and the flight home (routes report their `home`) — so it moves from the first take-off and
shows 100 % only when every UAV has landed, the same moment the mission completes. A UAV that
landed early (stop, low battery) counts as done; ETA is the time until the last UAV lands.

Routes mark their task span (`task_start` / `task_end` waypoint indexes; before it: transit from
the base and its detours) and, for patrol and inspection, `lap_size`. From these the client
derives each UAV's phase — pending, en route, on task (with lap/orbit), returning (with reason),
landed — as a pure function next to the progress (`uavMissionStatus`). The mission status line
shows phase counts ("2 en route · 3 scanning · 1 returning · ETA"); a low-battery return is
counted apart in warning tone, since color signals status, not phase. The UAV inspector shows
the UAV's phase with its lap ("Patrolling · lap 2 of 3"), its own progress and ETA to landing,
passed in by the route-level composition because the fleet module does not own missions.
The status bar expands into a per-UAV list (phase, lap, progress, ETA, battery on landing);
choosing a row selects and focuses that UAV. Telemetry carries the backend's `landing_battery_pct`
estimate (rest of the route plus the way home, from its battery model; optional for backends
without one); below the low-battery threshold it is shown in warning tone.

Mission types (planned by the backend, `@horizon/simulator`):

- **Area Scan** — boustrophedon coverage of a polygon, one strip per UAV.
- **Patrol** — a closed loop drawn corner by corner. All UAVs fly it in the same direction, spaced
  evenly along its length, for a set number of laps (1–10), each starting and ending at its own
  point on the loop. Loop legs and transit detour around no-fly zones; a corner inside a zone
  rejects the plan. Progress is the same distance-based measure, so laps count toward it.

- **Point Inspection** — one target point; UAVs orbit it at a set radius (30–1000 m) for a set
  number of orbits. The backend turns target and radius into a 24-point orbit loop and plans it
  as a patrol, so spacing, orbits, detours and progress behave the same; an orbit passing through
  a no-fly zone rejects the plan. The planned mission's `area` is that orbit.

The plan request carries `type`, `laps` for patrol and inspection, and `radius_m` for inspection;
`area.polygon` holds the scan area, the loop, or the single inspection target.

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

Rendering paths (`modules/fleet`, `modules/map`):

- the fleet store keeps immutable per-UAV snapshots in a shallow ref: one reactive trigger and one
  change notification per flushed batch, no deep proxies;
- the map consumes a `FleetFeed` (snapshot + per-batch deltas of changed UAVs) outside component
  rendering; the control-center view does not depend on telemetry;
- parked UAVs get constant Cesium properties; only moving UAVs are evaluated per frame;
- derived UI state (mission summary, fleet rows, filter counts) is stable: unchanged values keep
  their identity, so components update only when what they show changes;
- incident detection runs on its own 500 ms cadence, not per telemetry flush.
- the telemetry flush interval is configured once (`VITE_TELEMETRY_FLUSH_MS`, default 100 ms) and
  the interpolation render delay once (`RENDER_DELAY_MS`, shared by map and video);
- discrete events (mission state, connection) are never coalesced; they are classified by `type`
  before any full validation, so telemetry does not pay for parsing other event types;
- Cesium runs with `requestRenderMode`: an idle scene renders only on change (camera input, tiles,
  app state), and keeps rendering every frame while any UAV is moving;
- mission routes/waypoints are static geometry, rebuilt only when the overlay or ground height
  changes; demo diagnostics show coalesced and stale-dropped telemetry per second.

Benchmark (Stress preset, mock backend, Chromium, 2026-10-03):

```text
fleet                       480 UAVs (6 flying, rest parked)
telemetry in                ~500 msg/s at 1× · ~4000 msg/s at 8×
store flushes               ~4–10 /s (≤ 1 per flush interval)
Cesium                      60 FPS under active load · ~4 renders/s when idle
long tasks                  0 in 30 s, including select / inspector / follow
memory (after GC, 75 s 8×)  stable, ~156–166 MB
```

Decision: the Entity API stays and no Web Worker is used until profiling shows a real
bottleneck; re-run this benchmark before changing either.

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

Status precedence (`modules/fleet/model/fleet.status.ts`):

```text
no telemetry for > 15 s          offline
no telemetry for > 5 s           stale
battery < 20 % | signal < 35 %   warning
  | fewer than 6 GPS satellites
on a mission                     active
otherwise                        standby
```

The fleet store re-evaluates statuses every second, so UAVs age to stale/offline without new
telemetry.

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

Implementation (`modules/fleet/model/fleet-sync.ts`): an unexpected transport close switches to
`reconnecting` and retries with backoff (1 s, 2 s, 4 s, then every 8 s). Each attempt reconnects
the stream and then loads a fresh snapshot to reconcile. Statuses keep ageing while disconnected,
so UAVs go stale/offline but keep their last known positions. The simulator's fake network
(`setNetwork`) drives outages through the same transport and repository contracts.

---

## 13. Infrastructure composition

Concrete infrastructure is selected once during bootstrap.

```ts
interface AppServices {
  fleetRepository: FleetRepository
  realtimeTransport: RealtimeTransport
  missionPlanner: MissionPlanner
  airspaceRepository: AirspaceRepository
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

Selection: `VITE_DATA_SOURCE=mock` (default) or `remote` with `VITE_API_URL` and `VITE_WS_URL`
(validated; required in remote mode). Remote implementations:

```text
RestFleetRepository        GET  {api}/fleet/snapshot              → FleetSnapshotDto
RemoteMissionPlanner       POST {api}/missions/plan               → MissionDto (409/422 + {message, geofence_ids?} = planning error)
                           POST {api}/missions/{id}/launch | abort → 204
                           GET  {api}/missions/current            → MissionDto | empty
RemoteVideoProvider        GET  {api}/uavs/{id}/video             → VideoSourceDto | 404
RestAirspaceRepository     GET  {api}/airspace/geofences          → [{id, name, polygon: [{lat, lon}]}]
WebSocketRealtimeTransport {ws}  JSON envelopes {type: 'telemetry' | 'mission' | 'heartbeat', data}
```

Wire DTOs are the same snake_case formats the simulator produces. The WebSocket transport does
not reconnect itself: an unexpected close reaches the fleet sync, which reconnects with backoff
and reconciles from a fresh REST snapshot — the same flow as in mock mode. The backend sends a
`heartbeat` every 5 s; with no message of any kind for 15 s the transport treats the link as dead
(half-open sockets never fire `close`), drops it with code 4000 and reports `closed`, which starts
the same reconnect. Duplicate and out-of-order telemetry is dropped by the latest-state buffer. Demo controls exist
only in mock mode.

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

Initial state is idle: all 24 UAVs are parked in standby on the pitch of a football stadium in Abu Dhabi that serves as the base. The prepared Area Scan mission (the baseline above) is started manually by a demo command, or automatically on startup when demo autostart is enabled through configuration.

Only one mission is active at a time. Multi-mission operation is out of MVP scope.

Return-to-home rules (simulator):

- mission completed, mission stopped (`abortMission` → status `aborted`) or low battery all send
  UAVs home; telemetry carries `flight_phase` and `return_reason`;
- low battery: a UAV returns as soon as its battery covers only the climb, the flight home and the
  landing plus an 8 % reserve; the rest of the mission continues;
- deconfliction: returning UAVs first climb vertically to a return layer 20 m above the scan
  altitude, so return paths never cross active scan lines. Scan strips and parking spots never
  overlap by construction. Full collision avoidance is out of MVP scope.

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

Implementation: `DemoControl` (`modules/demo-controls`) is provided only by the mock composition
and only when `VITE_DEMO_CONTROLS` is on (default in dev). Presets: NORMAL (demo mission),
INCIDENT (NORMAL plus a scheduled failure sequence on mission UAVs: signal → low battery →
telemetry loss → backend outage → reconnect → restore), STRESS (480 UAVs). Failures are reversible switches on the selected UAV (low battery, weak signal, telemetry
loss, no-fly zone drift) plus a network outage switch; switching off restores the previous
behavior (e.g. the battery level, the UAV's route), and the panel reads the injected state back
from the simulator, so the scripted INCIDENT sequence is reflected too. Presets and reset
replace backend state, so the app resyncs through the normal snapshot path. Diagnostics show
incoming telemetry rate, store flush rate, fleet size and connection state.

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

The initial implementation is a synthetic onboard camera, clearly labelled `SIMULATED FEED`:
the mock provider returns a `synthetic-imagery` source, and `modules/video-monitoring` renders a
nadir view of Esri World Imagery under the selected UAV on a canvas (ground width
2·h·tan(35°), rotated to heading, smoothed between telemetry samples, subtle drift, HUD with
altitude, speed and heading). A stale link freezes the last frame; offline UAVs or UAVs without
a camera show no feed.

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
GEOFENCE_BREACH
```

Event behavior:

- info → event history/feed;
- warning → subtle alert + history;
- critical → prominent alert with an action.

Incident actions should update/focus the real application state rather than remain disconnected log entries.

Implementation (`modules/incidents`): `detectIncidents` compares consecutive observations of the
fleet, the backend link and the current mission (provided by `useControlCenter`, so the module
does not read fleet state) and records events in an incidents store. Warning/critical events are
alerts until acknowledged or resolved by the opposite transition (e.g. connection restored).
During a backend outage one `CONNECTION_LOST` replaces per-UAV link events. `WAYPOINT_REACHED` is
not emitted (too noisy for the feed); `MISSION_ABORTED` was added for operator stops. Inspect
selects the UAV, focuses the map and opens the inspector through the normal selection path.

### Geofences

No-fly zones are fixed backend data (`modules/airspace`, `AirspaceRepository`), loaded once
through TanStack Query (`staleTime: Infinity`) and drawn on the map. Planning flies around them:
scan lines skip each zone plus a margin, and every leg — transit from the base, jumps between
scan lines, and the return home (also after low battery or a stop) — detours along the shortest
path around the zones (visibility graph over inflated zone corners, `@horizon/simulator`
`airspace-routing.ts`). A plan is rejected only when nothing is left to scan; the error carries
the ids of all conflicting zones and the map highlights them. A flying UAV inside a zone (e.g. the demo breach) raises a
critical `GEOFENCE_BREACH`, resolved when it leaves; the zone is highlighted meanwhile.
Containment uses planar tests on longitude/latitude (`@horizon/domain`), adequate at site scale.

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

E2E runs with Playwright against the mock backend (`pnpm e2e`, specs in
`apps/control-center/e2e/`); it starts its own dev server with demo controls enabled and drives
failures through the demo panel. Unit/integration tests run with `pnpm test` (Vitest, `src/`).

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

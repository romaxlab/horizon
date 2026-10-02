# Architecture

## 1. Architecture direction

The MVP uses:

> **pnpm monorepo + modular vertical slices + thin Vue UI + explicit infrastructure boundaries**

The goal is strong separation without enterprise-style ceremony.

This is **not** strict FSD and **not** full Clean Architecture. We borrow the parts that keep the code understandable and replaceable.

## 2. Core architectural principles

1. UI is thin.
2. Business/application logic lives outside `.vue` files.
3. External systems are hidden behind small contracts.
4. Mock and remote infrastructure use the same contracts.
5. Realtime data and server state have explicit ownership.
6. Cross-module workflows are orchestrated in the route-level module.
7. Abstractions exist only when they protect a boundary or have multiple implementations.
8. Modules expose public APIs through `index.ts`.

## 3. Workspace

```text
swarm-control/
├── apps/
│   └── control-center/
├── packages/
│   ├── domain/
│   ├── realtime/
│   ├── simulator/
│   └── ui/
├── docs/
├── AGENTS.md
├── pnpm-workspace.yaml
└── package.json
```

Initial workspace deliberately contains only one application and four reusable packages.

Do not create more packages until reuse or boundary protection clearly justifies it.

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

## 5. Naming consistency

The route-level feature must be easy to find by name.

```text
URL              /control-center
Route name       control-center
Module           modules/control-center
Root view        ControlCenterView.vue
Composable       useControlCenter.ts
```

Conventions:

```text
*View.vue          route-level screen
*Panel.vue         major module panel
*Inspector.vue     detail/inspection surface
*Card.vue          domain-specific composed card
Base*.vue          design-system primitive
use*.ts            composable / UI application API
*.store.ts         Pinia store
*.repository.ts    repository contract/implementation
*.mapper.ts        DTO ↔ domain mapping
*.schema.ts        external payload validation
```

## 6. Route-level composition module

`modules/control-center` is the UI composition and orchestration module.

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

- Map
- Fleet Panel
- UAV Inspector
- Mission Status
- Incidents
- Demo controls when enabled

It does **not** contain fleet, mission, reconnect, video or Cesium business logic.

Cross-module coordination belongs in `useControlCenter()` or a small orchestration helper owned by this module.

Example:

```text
Incident → Inspect UAV
      ↓
useControlCenter()
      ↓
select UAV
focus map
open inspector
video module reacts to selected UAV
```

## 7. Feature modules

Use a small default module shape:

```text
modules/fleet/
├── ui/
├── model/
├── api/        # only when the module owns API concerns
└── index.ts
```

Optional `lib/` is allowed only when the module has substantial pure helpers that do not belong in `model/`.

Do not pre-create empty architectural folders.

### ui/

Vue components only.

A component consumes a dedicated composable/view-model API.

Preferred:

```ts
const {
  uavs,
  selectedUav,
  warningCount,
  selectUav,
} = useFleetPanel()
```

A `.vue` file must not:

- call `fetch`;
- create WebSockets;
- parse or validate DTOs;
- know backend field names;
- implement stale/offline rules;
- implement reconnect logic;
- manipulate simulator state directly;
- contain mission planning algorithms.

### model/

Owns module application logic.

May contain:

- composables;
- Pinia store;
- derived selectors;
- state transitions;
- small business rules;
- TanStack Query wrappers when the module owns server data.

Do not create one giant `useModule()` composable. Prefer UI/use-case-oriented composables such as:

```text
useFleetPanel()
useUavInspector()
useMissionBuilder()
useMissionStatus()
useIncidentCenter()
```

### api/

Owns the boundary to module-specific remote data.

May contain:

- repository contract/implementation;
- DTO types;
- Zod schemas;
- mapper;
- query keys/query functions if they are module-specific.

Application UI never imports DTOs.

### index.ts

Public module API.

Other modules must not deep-import internals.

Good:

```ts
import { FleetPanel } from '@/modules/fleet'
```

Bad:

```ts
import { x } from '@/modules/fleet/model/internal/x'
```

## 8. Map module

Cesium is large enough to be an application capability, but not yet a reusable workspace package.

Initial location:

```text
modules/map/
├── ui/
│   └── MapCanvas.vue
├── model/
│   ├── useMap.ts
│   └── map.store.ts       # only if shared map UI state is actually needed
├── lib/
│   └── cesium/
│       ├── viewer.ts
│       ├── uav-layer.ts
│       ├── mission-layer.ts
│       ├── camera-controller.ts
│       └── interpolation.ts
└── index.ts
```

Do not extract `@swarm/map` in the MVP unless a second application genuinely needs it.

Cesium is a rendering adapter, never the source of truth.

## 9. Workspace packages

### @swarm/domain

Pure TypeScript domain contracts and shared entities:

- UAV
- telemetry
- missions
- routes/waypoints
- geo types
- operational events

Must not depend on Vue, Pinia, Tailwind, Cesium or concrete network implementations.

### @swarm/realtime

Owns transport-level realtime concerns:

- `RealtimeTransport` contract;
- WebSocket implementation;
- validation hooks;
- latest-state buffer;
- batching/flushing;
- transport connection state.

It must not render UI.

### @swarm/simulator

Deterministic fake backend:

- fleet generation;
- telemetry generation;
- mission execution;
- incident scheduling;
- simulator commands;
- demo presets.

It must not import application modules.

### @swarm/ui

First-party design-system primitives and tokens.

It must not know about UAVs, missions, telemetry, Cesium or incidents.

## 10. Dependency direction

```text
Vue UI
  ↓
module composable / model
  ↓
domain contracts + injected services
  ↓
repository / transport / provider
  ↓
external infrastructure
```

Lower layers do not import higher layers.

## 11. State ownership

### Server state

Use TanStack Vue Query for REST/server lifecycle:

- fetching;
- caching;
- retry;
- invalidation;
- mutation state;
- request cancellation.

### Realtime application state

Use Pinia for current shared realtime state consumed by multiple modules.

Examples:

- current fleet state;
- selected UAV ID when shared across modules;
- current active mission execution state;
- connection state;
- incident feed when driven by realtime events.

### Local UI state

Keep transient presentation state local to a composable/component when it is not cross-module state.

Examples:

- open menu;
- current mission-builder step;
- temporary form input;
- hovered row;
- local panel expansion.

## 12. Query + Pinia source-of-truth rule

Do not let Query cache and Pinia become two independent truths for the same live entity.

For a realtime domain such as fleet state:

```text
TanStack Query fetches snapshot
        ↓
explicitly hydrate/reconcile Pinia
        ↓
Pinia becomes the UI source of truth for current live state
        ↑
realtime updates
```

Query remains responsible for request lifecycle, not live rendering state.

For non-realtime server data, Query cache may remain the source of truth without copying into Pinia.

## 13. HTTP boundary

Preferred chain:

```text
UI
→ module composable
→ TanStack Query
→ Repository
→ HttpClient
→ native fetch
```

`HttpClient` should stay small and may centralize:

- base URL;
- default headers;
- JSON parsing;
- standard error mapping;
- `AbortSignal` forwarding.

No Axios unless a concrete requirement appears.

## 14. Realtime boundary

```text
Simulator / WebSocket
      ↓
RealtimeTransport
      ↓
validate
      ↓
latest-state buffer
      ↓
batch flush
      ↓
Pinia
      ↓
Vue + Cesium
```

UI update cadence must be decoupled from incoming packet frequency.

## 15. Dependency injection / composition root

Concrete infrastructure is selected once during app bootstrap.

```ts
interface AppServices {
  fleetRepository: FleetRepository
  realtimeTransport: RealtimeTransport
  missionPlanner: MissionPlanner
  videoProvider: VideoProvider
}
```

Demo composition:

```text
MockFleetRepository
MockRealtimeTransport
MockMissionPlanner
MockVideoProvider
```

Remote composition:

```text
RestFleetRepository
WebSocketRealtimeTransport
RemoteMissionPlanner
RemoteVideoProvider
```

Use typed Vue provide/inject or equivalent app context.

Do not implement an untyped global service locator.

## 16. Configuration

Only the config layer reads `import.meta.env`.

```text
.env
→ validate
→ appConfig
→ bootstrap
→ concrete services
```

Modules consume config/services, not raw environment variables.

## 17. SOLID without overengineering

SOLID is a responsibility/dependency guideline, not a class-count target.

Create an abstraction when:

1. there are multiple implementations now or immediately planned; or
2. it isolates application logic from an external dependency.

Good abstractions in this MVP:

- RealtimeTransport
- FleetRepository
- MissionPlanner
- VideoProvider

Avoid abstractions like `UavFormatterInterface` unless a real need appears.

## 18. Architecture smells

Avoid:

- direct API calls from `.vue`;
- direct WebSocket use from `.vue`;
- store mutation scattered across UI components;
- DTOs leaking into UI;
- circular module imports;
- module deep imports;
- duplicate live state in Query + Pinia;
- Cesium entity state treated as domain state;
- simulator-only code paths that bypass normal contracts;
- extracting packages only to make the monorepo look larger.

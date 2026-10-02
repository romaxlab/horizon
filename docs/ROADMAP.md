# Roadmap

The roadmap defines implementation milestones for the Horizon MVP.

Changes should remain small, testable and easy to review. A milestone does not need to be delivered as one commit.

---

## Milestone 0 — Repository foundation

Create the workspace:

```text
apps/control-center
packages/domain
packages/realtime
packages/simulator
packages/ui
```

Configure:

- pnpm workspaces;
- Vue 3 + Vite + TypeScript;
- shared TypeScript config;
- strict mode;
- Vue Router;
- Pinia;
- TanStack Vue Query;
- ESLint;
- Prettier;
- `prettier-plugin-tailwindcss`;
- root scripts.

Baseline commands:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Expected outcome:

- application starts;
- workspace imports resolve;
- shared tooling works;
- no product functionality yet.

---

## Milestone 1 — Design-system foundation

Configure:

- TailwindCSS;
- primitive tokens;
- semantic tokens;
- light/dark semantic aliases;
- semantic Tailwind utilities;
- typed primitive variants.

Build only primitives needed for the first shell:

```text
BaseText
BaseButton
BaseIconButton
BaseSurface / BasePanel
BaseBadge
BaseDivider
BaseMetric
BaseProgress
BaseAlert
BaseInput
```

Add a simple style guard if useful to prevent raw colors/arbitrary design values outside token sources.

Expected outcome:

- both themes work;
- UI primitives define the visual language;
- feature code does not need ad-hoc component styling.

---

## Milestone 2 — Domain and app infrastructure

Create `@horizon/domain` core models:

- UAV;
- telemetry;
- mission;
- geo points;
- routes;
- waypoints;
- operational events.

Configure app infrastructure:

- central validated config;
- Query provider;
- Pinia;
- router;
- typed application services;
- native-fetch HTTP wrapper;
- mock service composition.

Expected outcome:

- application can bootstrap with injected mock services;
- external implementations are replaceable through contracts.

---

## Milestone 3 — Simulator and realtime pipeline

Implement `@horizon/simulator`:

- deterministic fleet generation;
- 24-UAV baseline;
- 6 mission UAVs;
- telemetry generation;
- position updates;
- battery/signal changes;
- simulator commands;
- deterministic/random modes.

Implement `@horizon/realtime`:

- `RealtimeTransport`;
- mock transport;
- message validation;
- out-of-order handling;
- latest-state buffering;
- batched state flushing;
- connection lifecycle.

Expected outcome:

```text
Simulator
→ MockRealtimeTransport
→ validation/buffer
→ Pinia
```

works without UI shortcuts.

---

## Milestone 4 — Control Center shell

Create:

```text
/control-center
modules/control-center/
ControlCenterView.vue
useControlCenter.ts
```

Build the main composition:

- header;
- fleet panel area;
- map area;
- inspector area;
- mission status;
- incident surface.

Use design-system primitives from the start.

Expected outcome:

- primary application layout exists;
- modules have clear ownership;
- route naming is consistent.

---

## Milestone 5 — 3D map

Add CesiumJS directly through the map module.

Implement:

- Abu Dhabi initial view;
- basic terrain/globe fallback;
- UAV entity rendering;
- altitude;
- heading;
- smooth interpolation;
- selection;
- fly-to;
- explicit Follow mode;
- mission polygon;
- route/waypoints;
- completed trail.

Performance rules:

- update existing entities;
- avoid all-UAV labels at distance;
- avoid detailed models where icons are sufficient;
- measure before introducing lower-level Cesium primitives.

Expected outcome:

- simulated UAVs move smoothly in 3D;
- selecting a UAV coordinates map focus with application state.

---

## Milestone 6 — Fleet monitoring

Implement:

- normalized fleet Pinia state;
- active/warning/stale/offline derivation;
- counts;
- search/filter;
- UAV selection;
- Fleet Panel;
- UAV Inspector;
- last-update state.

Expected outcome:

```text
select UAV
→ list selection
→ map focus
→ inspector opens
```

with one shared selected UAV ID.

---

## Milestone 7 — Mission planning

Primary mission:

```text
Area Scan
```

Flow:

```text
New Mission
→ mission details
→ draw polygon
→ altitude/UAV count
→ Generate Plan
→ Review
→ Launch
```

Implement:

- draft mission state;
- map-based polygon;
- deterministic mock planner;
- UAV assignment;
- scan routes;
- estimates;
- launch transition;
- mission execution;
- progress derived from waypoints/routes.

Expected outcome:

- complete mission workflow works end-to-end.

---

## Milestone 8 — Video monitoring

Implement:

- `VideoProvider`;
- mock video provider;
- prerecorded aerial video;
- `SIMULATED FEED` label;
- loading/live/unavailable/error states;
- selected UAV integration.

Expected outcome:

- video failure is isolated from telemetry and map state.

Do not add HLS/WebRTC dependencies until they are actually required.

---

## Milestone 9 — Incidents and recovery

Implement operational events:

```text
LOW_BATTERY
SIGNAL_DEGRADED
TELEMETRY_STALE
CONNECTION_LOST
CONNECTION_RESTORED
```

Incident UX:

```text
alert
→ Inspect
→ select UAV
→ map focus
→ inspector
```

Reconnect behavior:

```text
connection lost
→ preserve last known state
→ reconnect
→ fetch current snapshot
→ reconcile
→ resume stream
→ LIVE
```

Expected outcome:

- failures degrade gracefully;
- event actions are connected to real application state.

---

## Milestone 10 — Demo controls and diagnostics

Add development/demo capabilities behind configuration:

```text
NORMAL
INCIDENT
STRESS
```

Commands may include:

- low battery;
- signal degradation;
- telemetry loss;
- restore connection;
- complete mission;
- reset simulation;
- optional time multiplier.

Optional diagnostics:

- incoming telemetry msg/s;
- state flush rate;
- fleet size;
- connection state.

All demo behavior must enter through the simulator and normal realtime pipeline.

---

## Milestone 11 — Testing

Add focused tests with:

```text
Vitest
Vue Test Utils
Playwright
```

Priority unit/integration coverage:

- schemas/mappers;
- telemetry ordering;
- stale/offline transitions;
- mission progress;
- reconnect state;
- simulator determinism;
- mission planner;
- important composables.

Primary E2E flows:

### Mission

```text
Create mission
→ generate plan
→ launch
→ execution visible
```

### Inspection

```text
Select UAV
→ inspector opens
→ telemetry/video visible
```

### Recovery

```text
simulate connection loss
→ stale/offline
→ reconnect
→ current state restored
```

---

## Milestone 12 — Product polish

Review:

- dark theme;
- light theme;
- visual hierarchy;
- map prominence;
- panel density;
- typography;
- keyboard/focus behavior;
- reduced motion;
- Cesium camera timing;
- performance;
- error states;
- README;
- screenshots.

Run the complete quality gate:

```bash
pnpm check
```

---

## MVP completion criteria

The MVP is complete when the primary workflow works reliably:

```text
Control Center
→ Create Area Scan mission
→ Generate routes
→ Launch
→ Monitor realtime execution
→ Inspect UAV
→ View simulated video
→ Handle incident
→ Recover connection/state
```

The implementation should also satisfy:

- clear module ownership;
- mock/remote-ready infrastructure boundaries;
- deterministic demo behavior;
- both themes;
- no duplicated live state;
- passing lint/typecheck/tests/build;
- no unnecessary architecture added beyond the needs of the product.

---

## Later / optional

Only after the core experience is polished:

- 200–500 UAV stress profiling;
- clustering or lower-level Cesium rendering;
- telemetry charts;
- additional mission types;
- geofences;
- HLS;
- WebRTC;
- additional applications/workspaces.

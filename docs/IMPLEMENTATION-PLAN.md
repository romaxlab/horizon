# Implementation Plan

## 1. Agent execution rule

The agent must work in **small, reviewable tasks**.

Do not build the entire product in one prompt.

For every task:

1. read `AGENTS.md`;
2. read the relevant docs;
3. read `docs/CURRENT-STATE.md`;
4. state the exact files/scope to change;
5. implement only that scope;
6. run relevant checks;
7. update `docs/CURRENT-STATE.md`;
8. stop for review.

Do not proceed automatically to the next task.

## 2. Definition of done for every task

A task is not complete until:

- scope is implemented;
- no unrelated refactor was introduced;
- lint passes for touched workspace;
- typecheck passes for touched workspace;
- relevant tests pass;
- no architecture/style rule is knowingly violated;
- `CURRENT-STATE.md` is updated.

Milestone tasks additionally run root `pnpm check`.

---

# Milestone 0 — Repository foundation

## Task 0.1 — Workspace scaffold

Create:

```text
apps/control-center
packages/domain
packages/realtime
packages/simulator
packages/ui
```

Configure:

- pnpm workspace;
- shared TypeScript config;
- Vue 3 + Vite app;
- package naming;
- root scripts.

Do not implement product features.

## Task 0.2 — Code-quality baseline

Add:

- TypeScript strict mode;
- `vue-tsc`;
- ESLint;
- Prettier;
- Tailwind Prettier plugin;
- basic CI/check scripts.

Acceptance:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

pass.

---

# Milestone 1 — Design system

## Task 1.1 — Tailwind + token foundation

Implement:

- TailwindCSS;
- `primitives.css`;
- `semantic.css`;
- semantic Tailwind mappings;
- light/dark root switching.

No feature styling yet.

Acceptance:

- raw values live only in token source;
- semantic utilities resolve through CSS vars;
- both themes work.

## Task 1.2 — Core UI primitives

Implement only the primitives needed for the shell:

```text
BaseText
BaseButton
BaseIconButton
BaseSurface/BasePanel
BaseBadge
BaseDivider
```

Use typed variants via CVA.

## Task 1.3 — Metric/status primitives

Add as required:

```text
BaseMetric
BaseProgress
BaseAlert
BaseInput
```

Do not create unused primitives.

## Task 1.4 — Style guard

Add a practical script/check that detects common raw-style violations outside token source files.

---

# Milestone 2 — Domain + app infrastructure

## Task 2.1 — Domain models

Implement `@swarm/domain`:

- Uav;
- UavTelemetry;
- UavState types;
- Mission;
- MissionPlan;
- UavRoute;
- Waypoint;
- OperationalEvent;
- geo types.

No Vue/Pinia/Cesium dependencies.

## Task 2.2 — App configuration

Implement:

- env validation;
- typed `appConfig`;
- feature flags;
- demo/remote selection;
- map/video provider config.

Only config code may read `import.meta.env`.

## Task 2.3 — Providers/bootstrap

Add:

- Pinia;
- TanStack Vue Query;
- Vue Router;
- typed AppServices context;
- mock service composition skeleton.

No product feature logic yet.

---

# Milestone 3 — Simulator + realtime

## Task 3.1 — Deterministic simulator core

Implement:

- seeded fleet generation;
- 24-UAV baseline;
- physical position state;
- tick loop;
- telemetry generation.

No incidents yet.

## Task 3.2 — Realtime contract + mock transport

Implement:

- `RealtimeTransport`;
- mock transport connected to simulator;
- connection lifecycle.

## Task 3.3 — Validation + ordering

Add:

- external payload validation;
- timestamp/order handling;
- invalid-message isolation.

## Task 3.4 — Buffer/batch pipeline

Implement latest-state buffer by UAV ID and controlled flush cadence.

Acceptance:

- incoming frequency can exceed Pinia/UI update frequency;
- same UAV updates collapse to latest state per flush window.

---

# Milestone 4 — Control Center shell

## Task 4.1 — Route/module naming

Create:

```text
/control-center
modules/control-center
ControlCenterView.vue
useControlCenter.ts
```

Root `/` redirects to `/control-center`.

## Task 4.2 — Shell layout

Build only the composition skeleton using UI primitives:

- header;
- Fleet slot;
- Map slot;
- Inspector slot;
- Mission status slot;
- Alerts slot.

Follow `UI-SPEC.md` and reference image.

No real feature behavior yet.

---

# Milestone 5 — Map capability

## Task 5.1 — Cesium bootstrap

Create `modules/map` and initialize Cesium.

Set default Abu Dhabi view.

Keep Cesium isolated from domain state.

## Task 5.2 — UAV layer

Render UAVs from application state with:

- position;
- altitude;
- heading;
- status;
- selection.

## Task 5.3 — Smooth movement

Implement sample-based interpolation.

Do not let Cesium invent authoritative positions.

## Task 5.4 — Camera controller

Implement:

- overview;
- focus/fly-to;
- explicit Follow;
- stop Follow.

Respect reduced motion.

---

# Milestone 6 — Fleet

## Task 6.1 — Fleet snapshot repository

Implement mock repository contract + snapshot fetch lifecycle through TanStack Query.

Hydrate Pinia explicitly.

## Task 6.2 — Fleet store + realtime reconciliation

Implement normalized current state:

```text
uavsById
selectedUavId
connection/current freshness metadata
```

Realtime updates reconcile into Pinia.

## Task 6.3 — Fleet Panel

Implement `useFleetPanel()` and thin UI:

- summary counts;
- search;
- status filter;
- UAV rows;
- selection.

## Task 6.4 — UAV Inspector

Implement `useUavInspector()` and inspector UI.

Show telemetry values and freshness state.

---

# Milestone 7 — Mission planning

## Task 7.1 — Mission draft flow

Implement:

- New Mission mode;
- name;
- Area Scan;
- altitude;
- UAV count;
- draft preservation.

## Task 7.2 — Draw mission area

Implement polygon drawing/editing on Cesium.

## Task 7.3 — Mission planner contract + mock planner

Implement deterministic scan-lane generation behind `MissionPlanner`.

## Task 7.4 — Plan review

Render:

- assigned UAVs;
- generated routes;
- estimated duration;
- coverage.

## Task 7.5 — Launch mission

Implement launch state transition and simulator mission execution.

---

# Milestone 8 — Video monitoring

## Task 8.1 — Provider contract

Implement:

```text
VideoProvider
MockVideoProvider
```

## Task 8.2 — Inspector video

Show prerecorded simulated feed with states:

```text
loading
live
unavailable
error
```

Label it clearly as simulated.

Video failure must not break telemetry/inspector.

---

# Milestone 9 — Incidents + recovery

## Task 9.1 — Operational events

Implement event ingestion and bounded event history.

## Task 9.2 — Low-battery incident

Add deterministic warning sequence and alert UX.

## Task 9.3 — Signal/stale/offline cascade

Implement:

```text
SIGNAL_DEGRADED
→ TELEMETRY_STALE
→ CONNECTION_LOST
```

## Task 9.4 — Reconnect/state sync

Implement:

```text
reconnect
→ refresh snapshot
→ reconcile Pinia
→ resume stream
→ CONNECTION_RESTORED
```

## Task 9.5 — Incident Inspect workflow

`Inspect` must orchestrate:

- select UAV;
- focus map;
- open inspector.

---

# Milestone 10 — Demo controls + diagnostics

## Task 10.1 — Demo controls module

Add only when `demoMode` is enabled.

Commands call simulator APIs, never stores directly.

## Task 10.2 — Presets

Implement:

```text
NORMAL
INCIDENT
STRESS
```

## Task 10.3 — Diagnostics

Optional diagnostics:

- incoming msg/s;
- state flush/s;
- fleet size;
- connection state.

---

# Milestone 11 — Testing

## Task 11.1 — Pure logic tests

Cover:

- mapper/validation;
- stale/offline rules;
- out-of-order events;
- mission plan logic;
- progress calculation.

## Task 11.2 — Composable/store tests

Cover public behavior of key module composables/stores.

## Task 11.3 — E2E mission flow

```text
Create → Generate Plan → Launch
```

## Task 11.4 — E2E inspection + incident recovery

```text
Select UAV → Inspector → Incident → Reconnect
```

---

# Milestone 12 — Final polish

## Task 12.1 — Design-system audit

Check:

- both themes;
- no raw values;
- primitives used consistently;
- no duplicate card/panel styling;
- typography variants;
- focus-visible;
- reduced motion.

## Task 12.2 — Architecture audit

Check:

- no API calls from Vue UI;
- no deep module imports;
- no DTO leaks;
- no duplicate Query/Pinia sources of truth;
- simulator follows normal contracts;
- no unnecessary packages/abstractions.

## Task 12.3 — Performance pass

Profile before optimizing.

Only optimize confirmed bottlenecks.

## Task 12.4 — Demo/repo polish

Finalize:

- README;
- screenshots;
- demo instructions;
- architecture explanation;
- clean Git history;
- deployable demo build.

Run:

```bash
pnpm check
```

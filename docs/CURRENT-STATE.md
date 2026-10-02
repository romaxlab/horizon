# Current State

## Status

Documentation baseline: **v0.2**

Implementation: **not started**

## Agreed product

- 3D browser-based UAV Control Center
- CesiumJS map
- Area Scan mission demo
- 24-UAV baseline fleet
- 6 UAVs assigned to the demo mission
- simulated telemetry
- simulated camera feed
- low-battery + connection-loss incident demo
- deterministic demo mode

## Agreed architecture

- pnpm monorepo
- one app initially: `apps/control-center`
- workspace packages: `domain`, `realtime`, `simulator`, `ui`
- modular vertical slices in the app
- route/module naming consistency around `control-center`
- thin Vue UI through dedicated composables
- TanStack Vue Query for server state/request lifecycle
- Pinia for shared realtime/client state
- native fetch behind Repository + small HttpClient
- typed dependency injection at bootstrap
- mock/remote implementations behind the same contracts
- direct CesiumJS integration in an app `map` module

## Agreed design system

- TailwindCSS
- first-party UI primitives
- raw design values only in token source
- semantic CSS variables everywhere else
- semantic Tailwind utilities
- light + dark theme from day one
- cards/panels/wrappers are primitives
- variant-based controls
- no general-purpose UI component library

## Primary reference

`docs/media/control-center-concept.png`

## Next implementation task

`IMPLEMENTATION-PLAN.md` → **Task 0.1 — Workspace scaffold**

## Update rule

After every implementation task, update this file with:

- completed task;
- meaningful decisions;
- deviations from docs;
- current known issues;
- exact next task.

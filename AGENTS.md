# Repository Development Rules

These rules define the expected implementation style across Horizon.

## General

- Keep changes focused and reviewable.
- Prefer simple explicit code over speculative abstractions.
- Do not change unrelated files as part of a feature or fix.
- Follow the architecture documented in `docs/ARCHITECTURE.md`.
- Follow the styling rules documented in `docs/DESIGN-SYSTEM.md`.
- Update documentation when a durable architecture or product decision changes.

## Vue UI

Vue components should remain presentation-focused.

A component may:

- render data;
- compose UI primitives;
- manage truly local presentation state;
- call actions exposed by its composable.

A component should not:

- call `fetch`;
- create WebSocket connections;
- parse or validate backend payloads;
- know backend DTO field names;
- implement mission-planning algorithms;
- implement reconnect or stale/offline rules;
- manipulate simulator state directly.

Preferred pattern:

```ts
const {
  uavs,
  selectedUav,
  warningCount,
  selectUav,
} = useFleetPanel()
```

## Module boundaries

Feature modules expose their public API through `index.ts`.

Good:

```ts
import { FleetPanel } from '@/modules/fleet'
```

Avoid deep imports into another module's internals.

Default feature structure:

```text
module/
├── ui/
├── model/
├── api/        # only when needed
└── index.ts
```

Do not pre-create empty architectural folders.

## Naming

```text
/control-center
modules/control-center/
ControlCenterView.vue
useControlCenter.ts
```

Conventions:

```text
*View.vue          route-level screen
*Panel.vue         major module surface
*Inspector.vue     detail/inspection surface
Base*.vue          design-system primitive
use*.ts            composable
*.store.ts         Pinia store
*.repository.ts    repository
*.mapper.ts        DTO/domain mapping
*.schema.ts        external payload validation
```

## State ownership

Use:

```text
TanStack Vue Query
→ REST/server request lifecycle and cache

Pinia
→ shared realtime/current client state

Composable/component state
→ local transient UI state
```

Do not maintain two independent sources of truth for the same live entity.

For realtime fleet state:

```text
snapshot query
→ hydrate/reconcile Pinia
→ Pinia becomes current live state
← realtime updates
```

## Infrastructure boundaries

External systems should be hidden behind small contracts where replacement is meaningful.

Core boundaries:

```text
FleetRepository
RealtimeTransport
MissionPlanner
VideoProvider
```

Mock and remote implementations must enter the application through the same contracts.

Do not add interfaces for trivial helpers purely for architectural symmetry.

## HTTP

Preferred chain:

```text
UI
→ composable
→ TanStack Query
→ repository
→ small HttpClient
→ native fetch
```

No Axios unless a concrete requirement appears.

## Realtime

Realtime ingestion and UI rendering cadence must be decoupled.

Preferred pipeline:

```text
Simulator / WebSocket
→ RealtimeTransport
→ validate
→ normalize
→ latest-state buffer
→ batched state flush
→ Pinia
→ Vue / Cesium
```

Do not patch Pinia for every incoming telemetry packet.

Invalid or out-of-order events should be ignored safely and logged where useful.

## Cesium

Cesium is rendering infrastructure, not domain state.

- authoritative position comes from telemetry;
- update existing map entities instead of recreating them;
- smooth motion through interpolation;
- keep last known positions during telemetry loss;
- avoid rendering labels/models at unnecessary detail levels.

## Design system

Application UI must use semantic tokens and first-party primitives from `@horizon/ui`.

Do not introduce:

- raw hex/rgb colors;
- arbitrary visual values where a token exists;
- duplicated card/panel/button styling;
- separate light/dark component branches for colors.

Direct Tailwind usage in feature modules is mainly for layout and composition.

## TypeScript

- strict mode is required;
- avoid `any`;
- external payloads enter as `unknown`;
- validate external data before application use;
- map DTOs to domain models before they reach UI.

## Tests

Prioritize behavior and boundaries.

Important coverage includes:

- DTO/domain mapping;
- telemetry ordering;
- stale/offline transitions;
- reconnect state;
- mission progress;
- simulator determinism;
- important composables;
- primary Playwright workflows.

Do not write tests solely to increase a coverage number.

## Quality gate

During development, run checks relevant to the touched area.

Before a substantial change is complete:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The root project should expose a `pnpm check` command that aggregates the standard quality gate.

## Git

Use focused Conventional Commit-style messages:

```text
feat: add control center shell
fix: preserve last known UAV position
refactor: isolate Cesium camera controller
test: cover telemetry ordering
chore: configure workspace tooling
docs: update architecture
```

Refactor before committing when a change introduced unclear responsibilities, duplicate state or unnecessary coupling.

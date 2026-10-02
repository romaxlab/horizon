# AGENTS.md

Read this file before making changes.

## 1. Product goal

Build a polished frontend MVP that demonstrates strong platform engineering without enterprise-style overengineering.

The demo must remain understandable to a human reviewer.

## 2. Read order before each task

1. `docs/CURRENT-STATE.md`
2. relevant product/spec document
3. `docs/ARCHITECTURE.md`
4. `docs/DESIGN-SYSTEM.md` for any UI work
5. `docs/IMPLEMENTATION-PLAN.md`

## 3. Task discipline

Implement only the requested task/scope.

Do not continue to the next implementation-plan task automatically.

Do not perform unrelated refactors unless required to make the task correct.

After the task, update `docs/CURRENT-STATE.md`.

## 4. Thin UI — non-negotiable

Vue components render and compose.

Preferred:

```ts
const {
  data,
  state,
  action,
} = useFeatureThing()
```

Vue components must not:

- call `fetch`;
- create WebSockets;
- validate/parse DTOs;
- map backend payloads;
- implement mission/reconnect/telemetry business rules;
- mutate simulator state;
- depend on concrete infrastructure implementations.

## 5. State ownership

```text
REST/server request lifecycle → TanStack Vue Query
shared live/current state      → Pinia
local presentation state      → composable/component
```

For realtime domains, Query may fetch the snapshot, but Pinia is the source of truth for current live rendering after hydration/reconciliation.

Do not create duplicate independent live state.

## 6. Infrastructure boundaries

Use small contracts for external systems:

- `FleetRepository`
- `RealtimeTransport`
- `MissionPlanner`
- `VideoProvider`

Mock and remote implementations must be substitutable.

No abstraction is required for a trivial helper simply to satisfy a pattern.

## 7. Monorepo boundaries

Initial workspace:

```text
apps/control-center
packages/domain
packages/realtime
packages/simulator
packages/ui
```

Packages must not import from `apps/control-center`.

Do not add a new workspace package without a concrete reuse/boundary reason.

## 8. Module boundaries

Modules expose public APIs through `index.ts`.

Do not deep-import another module.

Good:

```ts
import { FleetPanel } from '@/modules/fleet'
```

Bad:

```ts
import { x } from '@/modules/fleet/model/internal/x'
```

## 9. Naming

```text
/control-center
modules/control-center
ControlCenterView.vue
useControlCenter.ts
```

General conventions:

```text
*View.vue          route-level screen
*Panel.vue         major panel
*Inspector.vue     details/inspection
*Card.vue          domain-composed card
Base*.vue          UI primitive
use*.ts            composable
*.store.ts         Pinia store
*.repository.ts    repository
*.mapper.ts        DTO/domain mapper
*.schema.ts        external payload validation
```

## 10. Styling

`docs/DESIGN-SYSTEM.md` is authoritative.

Key rules:

- TailwindCSS only for styling/composition;
- first-party primitives for visual surfaces/controls/typography;
- raw design values only in token source files;
- semantic CSS variables everywhere else;
- both light and dark theme must work;
- wrappers/cards/panels are primitives;
- no ad-hoc card/panel styling in feature modules;
- dynamic inline styles only for actual runtime values.

## 11. TypeScript

- strict mode;
- no `any` as a shortcut;
- external payloads enter as `unknown`;
- validate external payloads;
- map DTOs into domain models;
- domain package stays framework-independent.

## 12. HTTP

Preferred chain:

```text
UI
→ composable
→ TanStack Query
→ Repository
→ HttpClient
→ native fetch
```

No `fetch` in `.vue` files.

## 13. Realtime

Preferred chain:

```text
Simulator / WebSocket
→ RealtimeTransport
→ validate/order
→ latest-state buffer
→ batch flush
→ Pinia
→ Vue / Cesium
```

Do not patch Pinia for every incoming packet.

## 14. Cesium

Cesium is rendering infrastructure.

It must not become domain state.

Authoritative UAV position comes from telemetry/simulator/backend; Cesium interpolates presentation between samples.

## 15. Demo mode

Demo controls manipulate simulator commands.

Never bypass normal application contracts by directly editing stores for a demo effect.

## 16. Quality gate

During a task, run the relevant package/app checks.

Before a milestone is complete:

```bash
pnpm check
```

Do not claim completion with failing checks.

## 17. Documentation drift

If implementation requires a meaningful deviation from the agreed architecture/spec:

1. do not silently diverge;
2. explain the reason;
3. update the relevant doc/decision;
4. record it in `CURRENT-STATE.md`.

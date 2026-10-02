# Testing Strategy

## Principle

Test business behavior and module contracts, not implementation details.

Do not chase a coverage percentage for the MVP.

## Tooling

```text
Vitest
Vue Test Utils
Playwright
```

## Unit tests

Prioritize:

- telemetry normalization;
- stale/offline rules;
- out-of-order event handling;
- mission progress calculation;
- DTO → domain mappers;
- mission planner logic;
- connection state transitions;
- incident rules.

Examples:

```text
marks UAV stale after timeout
ignores older telemetry
maps backend DTO into domain UAV
splits scan area into UAV routes
preserves last known position after telemetry loss
```

## Composable tests

Test public behavior of:

```text
useFleetPanel()
useUavInspector()
useMissionBuilder()
useMissionStatus()
useIncidentCenter()
```

Do not assert internal implementation details.

## Repository/contract tests

Mock and remote implementations should satisfy the same domain contract.

Useful boundary tests:

- valid DTO maps correctly;
- invalid payload is rejected;
- abort signal propagates;
- domain errors are consistent.

## UI tests

Only critical interactive components need focused UI tests.

Examples:

- selecting a UAV;
- mission builder flow;
- Incident → Inspect action;
- UAV Inspector loading/live/unavailable states.

Do not test Tailwind classes or trivial primitive internals unless behavior requires it.

## E2E

### Mission flow

```text
Create mission
→ draw/select area
→ Generate Plan
→ Launch
→ mission becomes active
```

### UAV inspection

```text
Select UAV
→ inspector opens
→ telemetry shown
→ simulated video shown
```

### Reconnect flow

```text
trigger telemetry loss
→ stale/offline
→ reconnect
→ state resynchronized
→ active/live restored
```

## Quality command

Root:

```bash
pnpm check
```

Expected to cover lint, typecheck, unit/integration tests, style guard and build.

Use deterministic simulator mode for E2E where practical.

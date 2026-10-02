# Swarm Control — MVP Documentation

Swarm Control is a browser-based 3D mission-control prototype for planning and monitoring autonomous UAV missions.

The MVP is designed as a frontend-focused demonstration of Vue 3, TypeScript, realtime UI, mapping, shared packages, modular architecture and reusable design-system work.

## Core demo

```text
Open Control Center
→ Create Area Scan mission
→ Draw mission area
→ Generate UAV-specific routes
→ Launch mission
→ Watch realtime UAV movement
→ Inspect UAV telemetry + simulated video
→ Trigger incident
→ Recover connection/state
```

The demo uses simulated data, but the simulator enters the application through the same contracts intended for future REST/WebSocket infrastructure.

## Architecture summary

- Vue 3 + TypeScript + Vite
- pnpm monorepo
- modular vertical slices inside `apps/control-center`
- thin Vue UI through dedicated composables
- Pinia for shared realtime/client state
- TanStack Vue Query for REST/server-state lifecycle
- native fetch behind repositories and a small HttpClient
- CesiumJS via a dedicated application map module
- TailwindCSS + first-party UI primitives
- semantic CSS-variable design tokens
- light + dark theme from day one
- deterministic simulator
- Vitest + Vue Test Utils + Playwright

## Documentation

Start with:

1. `AGENTS.md`
2. `docs/CURRENT-STATE.md`
3. `docs/PRD.md`
4. `docs/UI-SPEC.md`
5. `docs/ARCHITECTURE.md`
6. `docs/DESIGN-SYSTEM.md`
7. `docs/IMPLEMENTATION-PLAN.md`

Additional references:

- `docs/DATA-MODEL.md`
- `docs/REALTIME.md`
- `docs/SIMULATOR.md`
- `docs/TESTING.md`
- `docs/TECH-STACK.md`
- `docs/DEMO-SCRIPT.md`
- `docs/DECISIONS.md`
- `docs/media/control-center-concept.png`

## Status

Documentation baseline: **v0.2**

Implementation has not started yet.

Next task: `IMPLEMENTATION-PLAN.md` → **Task 0.1 — Workspace scaffold**.

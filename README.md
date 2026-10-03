<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/control-center/src/shared/brand/horizon-logo-dark.svg" />
    <img src="apps/control-center/src/shared/brand/horizon-logo.svg" alt="Horizon" height="96" />
  </picture>
</h1>

Horizon is a browser-based 3D mission-control interface for planning and monitoring autonomous UAV operations.

The product combines mission planning, realtime fleet telemetry, 3D situational awareness, UAV inspection, simulated video and incident handling in a single operator workspace.

The initial implementation uses deterministic simulated data. Application boundaries are designed so REST, WebSocket and media providers can be introduced without rewriting feature UI.

## Core workflow

```text
Open Control Center
→ Create Area Scan mission
→ Define mission area
→ Generate UAV-specific routes
→ Launch mission
→ Monitor realtime execution
→ Inspect UAV telemetry and video
→ Handle an operational incident
→ Recover connection and state
```

## Technology

- Vue 3
- TypeScript
- Vite
- pnpm workspaces
- Vue Router
- Pinia
- TanStack Vue Query
- TailwindCSS
- CesiumJS
- Zod
- Vitest
- Vue Test Utils
- Playwright

HTTP requests use native `fetch` behind a small repository/HTTP boundary. Realtime telemetry uses a transport abstraction so simulated and remote implementations share the same application pipeline.

## Repository structure

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
│   ├── ARCHITECTURE.md
│   ├── DESIGN-SYSTEM.md
│   └── ROADMAP.md
├── AGENTS.md
├── README.md
├── pnpm-workspace.yaml
└── package.json
```

The workspace is intentionally small. New packages or architectural layers should be introduced only when they protect a real boundary or provide real reuse.

## Product scope

The MVP centers on one operational route:

```text
/control-center
```

The 3D map remains the primary workspace. Mission planning, UAV inspection and incident handling are contextual modes and overlays rather than separate CRUD-style pages.

Primary mission type:

```text
Area Scan
```

The operator defines a polygon, altitude and UAV count. The planner generates deterministic UAV-specific routes that can be reviewed and launched.

Standard demo dataset:

- 24 UAVs in the fleet;
- 6 UAVs assigned to an active mission;
- realtime simulated telemetry;
- deterministic incidents;
- simulated UAV video feeds.

## Documentation

- `AGENTS.md` — repository implementation rules and quality expectations
- `docs/ARCHITECTURE.md` — product structure, data ownership and infrastructure boundaries
- `docs/DESIGN-SYSTEM.md` — Tailwind, tokens, themes and UI primitive rules
- `docs/ROADMAP.md` — implementation milestones

## Status

Horizon is currently in the foundation stage.

## Disclaimer

Horizon is a software prototype. It does not provide real aircraft control, safety-critical flight planning or production autonomy functionality.

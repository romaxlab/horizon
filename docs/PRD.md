# Product Requirements Document

## Product

**Name:** Swarm Control  
**Type:** Browser-based frontend concept prototype  
**Primary domain:** Autonomous UAV / multi-robot operations

## Problem

When many autonomous UAVs operate simultaneously, an operator cannot manually follow every telemetry stream.

The interface must make it easy to understand:

- where UAVs are;
- which UAVs are healthy;
- which UAV requires attention;
- what mission is active;
- whether telemetry is current;
- whether realtime connectivity is healthy.

## Product principle

> The operator should focus on exceptions, not individual telemetry streams.

## Primary user

**UAV Fleet Operator**

The operator supervises autonomous systems at a high level rather than manually piloting every vehicle.

## MVP goals

The MVP should demonstrate:

1. 3D situational awareness.
2. Realtime fleet monitoring.
3. High-level mission planning.
4. UAV inspection with telemetry and simulated camera feed.
5. Incident-driven UX.
6. Resilient reconnect/state-recovery behavior.
7. Clean frontend architecture prepared for REST/WebSocket integration.
8. A modular pnpm-workspace codebase.

## Main screen

The product is primarily one operational workspace:

```text
/control-center
```

The 3D map remains the main visual workspace.

Mission planning, UAV inspection and incident handling are modes/overlays inside the same screen, not separate CRUD pages.

## Primary mission type

### Area Scan

```text
New Mission
→ Enter mission details
→ Draw area polygon
→ Choose altitude / UAV count
→ Generate Plan
→ Review UAV routes
→ Launch Mission
→ Monitor execution
```

The MVP planner may be deterministic/simulated. It does not implement production path optimization.

## Main demo workflow

```text
Open Control Center
→ Create Area Scan mission
→ Generate swarm routes
→ Launch
→ Watch UAVs move
→ Inspect UAV
→ Show simulated live camera + telemetry
→ Trigger incident
→ Inspect affected UAV
→ Recover connection/state
```

## Main UI regions

### Header

Shows product name, active mission, realtime connection state, current time, and New Mission action.

### Fleet Panel

Shows total/active/warning/offline counts, search/filter, UAV list, and battery/status summaries.

### 3D Cesium Map

Shows UAV positions, heading, altitude, mission area, mission routes, waypoints, flight trail, and selected/warning state.

### UAV Inspector

Shows UAV identity, operational state, battery, altitude, speed, heading, signal, GPS, mission progress, and simulated camera feed.

### Mission Status

Shows mission progress, area coverage, active UAV count, and ETA.

### Incidents

Important incidents appear immediately and allow the operator to inspect the affected UAV.

## Required operational states

### UAV

- standby
- active
- warning
- stale
- offline

### Realtime connection

- connecting
- live
- reconnecting
- disconnected

### Mission

- draft
- planned
- active
- completed
- aborted

## MVP scope

Required:

- Vue 3 + TypeScript
- CesiumJS
- 3D map
- 20–50 simulated UAVs in standard mode
- 6-UAV Area Scan mission
- realtime telemetry simulation
- smooth UAV movement
- mission route generation
- fleet panel
- UAV inspector
- simulated video
- incidents
- stale/offline handling
- reconnect/state sync
- light/dark theme
- deterministic demo mode
- basic tests

## Stretch scope

Only after core is polished:

- 200–500 UAV stress mode
- marker clustering / lower-level Cesium optimization
- telemetry charts
- extra mission types
- geofence editor
- HLS provider
- WebRTC provider
- extra applications in the workspace

## Out of scope

- real UAV control
- real flight navigation
- weapons/payload control
- collision avoidance
- production autonomy algorithms
- production backend
- authentication/database
- real WebRTC signaling
- military operational functionality

## Success criteria

A reviewer should be able to understand the core demo within 2–3 minutes and see mission creation, generated UAV routes, realtime execution, individual UAV inspection, camera + telemetry, an operational incident, connection recovery, and clean backend-ready frontend boundaries.

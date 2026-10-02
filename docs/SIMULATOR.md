# Simulator Specification

## Purpose

The simulator is a deterministic fake backend.

It drives the same contracts expected from future real infrastructure.

The application should not have a separate "demo data path".

## Modes

```text
deterministic
random
```

### deterministic

Used for interview demo, screenshots, tests and predictable presentation.

### random

Used for exploration, visual testing and general playground behavior.

## Baseline dataset

Suggested standard demo:

```text
24 total UAVs
6 assigned to active Area Scan mission
18 standby/idle
```

Start location: Abu Dhabi region.

## Mission dataset

Primary mission:

```text
Name: Sector Alpha
Type: Area Scan
UAV count: 6
Altitude: 120 m
Area: ~2–3 km²
```

The mock mission planner generates deterministic scan lanes from the polygon.

## Simulation engine

Conceptual shape:

```text
SimulationEngine
├── fleet state
├── mission execution
├── telemetry generator
├── incident scheduler
└── commands
```

Simulation tick:

```text
tick
→ update physical positions
→ update battery/signal
→ update mission progress
→ emit telemetry
→ evaluate scheduled incidents
```

## Telemetry frequency

Normal mode may simulate roughly 5–10 Hz for active UAVs.

Stress mode may emit substantially more.

## Deterministic incident timeline

Example presentation scenario:

```text
00:00 Mission started
00:05 6 UAV active
00:15 UAV-04 reaches waypoint
00:30 UAV-03 battery degrades faster
00:45 LOW_BATTERY
01:00 UAV-06 SIGNAL_DEGRADED
01:08 UAV-06 telemetry becomes stale
01:15 CONNECTION_LOST
01:25 reconnect begins
01:30 connection restored
01:35 snapshot sync
01:40 UAV-06 ACTIVE
```

Exact timing may be compressed for presentation.

## Time multiplier

Support where useful:

```text
1x
2x
5x
10x
```

## Demo commands

Simulator commands may include:

```ts
simulateLowBattery(uavId)
simulateSignalLoss(uavId)
simulateTelemetryLoss(uavId)
restoreConnection(uavId)
completeMission()
resetSimulation()
```

These commands affect simulator state. They must not mutate Pinia/UI state directly.

## Presets

### NORMAL

- normal fleet;
- stable telemetry;
- active mission.

### INCIDENT

- low battery;
- signal degradation;
- telemetry loss;
- reconnect flow.

### STRESS

- 200–500 simulated UAVs;
- high telemetry throughput;
- diagnostics enabled.

Stress mode is a technical showcase, not the default demo.

## Video

Use prerecorded aerial footage for MVP.

Mark clearly as:

```text
SIMULATED FEED
```

Suggested mapping:

```text
UAV-01 → coastal aerial clip
UAV-02 → desert clip
UAV-03 → urban-edge clip
UAV-04 → industrial-area clip
```

A generic fallback feed is acceptable.

## Package boundary

`@swarm/simulator` must not import application modules.

It should expose only simulator capabilities/contracts needed by bootstrap/demo controls.

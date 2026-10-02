# Demo Script

Target length: **2–3 minutes**

The presentation should tell one product story rather than list features.

## Scene 1 — Control Center

Open:

```text
/control-center
```

Show 3D Abu Dhabi map, fleet, live connection and clean operational UI.

Suggested explanation:

> This is a small concept for a browser-based UAV control center. The application runs on simulated data, but the simulator uses the same contracts as a future REST/WebSocket backend.

## Scene 2 — Create Mission

Click `New Mission`.

Create:

```text
Sector Alpha
Area Scan
120 m altitude
6 UAVs
```

Draw mission area and click `Generate Plan`.

Show generated UAV routes.

Suggested explanation:

> The operator defines the objective rather than manually defining the path for each UAV. The planner generates UAV-specific routes for the mission area.

## Scene 3 — Launch

Click `Launch Mission`.

Show Cesium camera transition, UAVs starting, mission routes, progress, coverage and live telemetry.

Suggested explanation:

> Telemetry ingestion is separated from rendering, so high-frequency updates do not force the map to redraw for every packet.

Optional: briefly open diagnostics.

## Scene 4 — Inspect UAV

Select `UAV-04`.

Show camera fly-to, inspector, battery, altitude, speed, heading, signal, waypoint progress and simulated camera.

Suggested explanation:

> The component consumes a clean composable/view-model API. It does not know whether the data comes from the simulator or a real transport/provider.

## Scene 5 — Incident

Trigger `INCIDENT` preset.

Show:

```text
Signal degraded
→ telemetry stale
→ connection lost
```

Then show last known position retained, warning, Inspect action, degraded video and app continuity.

Recovery:

```text
reconnecting
→ snapshot sync
→ telemetry resumes
→ LIVE
```

Suggested explanation:

> After reconnecting, the application refreshes the current snapshot because events may have been missed, then resumes realtime updates.

## Optional bonus

If asked about performance, show `STRESS` preset with a larger fleet, telemetry msg/s and state flush rate.

## Do not spend demo time on

- theme switch;
- every debug control;
- tests;
- folder structure;
- every UI primitive.

Those are discussion material after the product flow.

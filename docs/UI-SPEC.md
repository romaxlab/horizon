# UI / UX Specification

## 1. Reference

Primary visual direction:

`docs/media/control-center-concept.png`

The image is a concept reference, not a pixel-perfect contract.

## 2. Product surface

The MVP is one map-first operational workspace:

```text
/control-center
```

The 3D operational map remains visible during the main workflows.

Do not turn mission creation, UAV inspection or incident handling into separate CRUD-style pages.

## 3. Desktop-first layout

Primary regions:

```text
┌────────────────────────────────────────────────────────────┐
│ Header                                                     │
├───────────────┬───────────────────────────┬────────────────┤
│ Fleet Panel   │                           │ UAV Inspector  │
│               │       3D Cesium Map       │                │
│               │                           │                │
├───────────────┴───────────────────────────┴────────────────┤
│ Mission Status / contextual bottom surface                │
└────────────────────────────────────────────────────────────┘
```

Panels float over or visually integrate with the map rather than creating a heavy admin-dashboard grid.

## 4. Header

Show only high-value controls/information:

- product name;
- active mission name/state;
- realtime connection state;
- current time;
- New Mission;
- light/dark theme control.

Avoid generic SaaS navigation unless a real feature requires it.

## 5. Fleet Panel

Shows:

- total fleet count;
- active/warning/offline summary;
- search;
- compact status filtering;
- UAV list.

Each UAV row should emphasize:

- identity;
- operational status;
- battery;
- optionally mission assignment.

Selecting a UAV:

```text
select UAV
→ highlight list row
→ map focuses/highlights UAV
→ inspector opens
```

## 6. 3D Map

The map is the primary visual surface.

Show only useful operational overlays:

- UAV positions;
- heading/orientation;
- altitude in 3D;
- active mission polygon;
- planned routes;
- completed trail;
- waypoints;
- selected UAV;
- warning/offline state.

Labels should not appear on every UAV at all zoom levels.

Prefer labels for:

- selected UAV;
- warning UAV;
- hovered/focused UAV.

## 7. UAV Inspector

Default: closed when nothing is selected.

When open, show:

- UAV name/callsign;
- state;
- mission;
- simulated video feed;
- battery;
- altitude;
- speed;
- heading;
- signal;
- GPS;
- last update;
- waypoint/progress;
- Follow action.

The video must be labeled as simulated in the MVP.

## 8. Mission status surface

Compact, always secondary to the map.

Show:

- mission state;
- progress;
- coverage;
- active UAVs;
- ETA.

Do not reserve a large permanent event table at the bottom.

## 9. Incidents

Important incidents appear as focused alerts with an action.

Example:

```text
LOW BATTERY
UAV-03 · 18%
[ Inspect ]
```

Inspect action:

```text
select affected UAV
→ focus map
→ open inspector
```

Incident feed/history may open as a secondary panel/drawer.

## 10. Application modes

The route remains `/control-center`.

High-level modes:

```text
overview
mission-planning
inspection
incident-focus
```

These are application states/overlays, not separate routes.

## 11. Mission planning mode

`New Mission` opens a focused mission builder while keeping the map visible.

Flow:

```text
Mission details
→ Draw Area
→ Generate Plan
→ Review
→ Launch
```

Initial fields:

- mission name;
- Area Scan type;
- altitude;
- UAV count.

Drawing the polygon should feel map-native.

## 12. Generated plan

After `Generate Plan`, show:

- assigned UAV count;
- estimated duration;
- coverage estimate;
- generated scan routes.

Routes should be visually distinguishable but not excessively colorful/noisy.

## 13. Launch transition

On launch:

```text
PLANNED
→ STARTING
→ ACTIVE
```

Use a smooth Cesium camera transition to the mission area.

UAV starts may be slightly staggered for natural presentation.

## 14. Selection and camera behavior

Clicking a UAV should not unexpectedly lock the camera forever.

Modes:

- overview;
- focus/inspect;
- explicit Follow.

`Follow` is user-controlled and reversible.

## 15. Failure UI

### Realtime disconnect

Show:

```text
RECONNECTING
Telemetry may be outdated
```

Keep last-known UAV positions.

### Video failure

Show video unavailable state while telemetry remains available.

### Planner failure

Preserve the mission draft and polygon.

### Map-provider failure

Fallback must preserve basic map/application usability where practical.

## 16. Visual density

Default state should be quiet.

The interface becomes more visually assertive only for:

- selection;
- warnings;
- critical incidents;
- active interaction.

Do not make every panel, route and metric equally prominent.

## 17. Light and dark theme

Both themes are first-class.

Dark is likely the primary demo presentation, but light must be fully usable and polished.

No component-specific theme hacks.

## 18. Responsive scope

Desktop/workstation first.

Target common laptop/desktop widths.

The MVP does not need a mobile operator experience.

Panels must still handle smaller laptop widths without overlap or broken text.

## 19. Motion

Use motion to communicate continuity:

- panel enter/exit;
- selection;
- alerts;
- Cesium fly-to;
- UAV interpolation.

Respect reduced-motion preferences.

## 20. UX success test

A first-time viewer should understand within seconds:

1. this is a fleet control center;
2. the map is the main workspace;
3. UAVs are live/dynamic;
4. one UAV can be inspected;
5. a mission can be created/launched;
6. incidents demand attention without overwhelming the whole UI.

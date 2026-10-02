# Realtime Specification

## Goal

Realtime infrastructure must support the simulated backend now and a real WebSocket backend later without changing feature UI.

## Transport contract

Conceptual contract:

```ts
interface RealtimeTransport {
  connect(): Promise<void>
  disconnect(): void

  subscribe(
    handler: (event: RealtimeEvent) => void
  ): () => void
}
```

Implementations:

```text
MockRealtimeTransport
WebSocketRealtimeTransport
```

## Event envelope

All realtime messages should enter the application through a consistent event model.

Example:

```json
{
  "type": "telemetry.updated",
  "timestamp": 1790942405123,
  "payload": {
    "uavId": "UAV-04",
    "battery": 81,
    "altitude": 121,
    "speed": 14.8,
    "heading": 247
  }
}
```

## Snapshot + stream

Startup:

```text
load current snapshot
→ populate initial state
→ connect realtime stream
→ apply incremental updates
```

After reconnect:

```text
socket reconnects
→ fetch latest snapshot
→ replace/reconcile current state
→ resume stream
→ LIVE
```

Do not assume all events were received while disconnected.

## Connection states

```ts
type ConnectionStatus =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'disconnected'
```

## High-frequency pipeline

Realtime ingestion and UI rendering frequency must be decoupled.

```text
500 events/sec
↓
validate
↓
latest-state buffer by UAV ID
↓
flush ~100 ms
↓
Pinia patch
↓
Vue / Cesium
```

Do not patch Pinia for every packet.

## Validation

External messages enter as `unknown`.

Validate before they reach application state.

Invalid message:

```text
ignore
+
log warning
```

One invalid event must not break the stream.

## Ordering

If an event is older than the current state timestamp for the same UAV, ignore it.

If a future backend provides a sequence number, support sequence-based ordering.

## Stale/offline behavior

Each UAV stores `lastUpdatedAt`.

Exact thresholds should be configurable.

Conceptually:

```text
recent
→ live/active

missing for short threshold
→ stale

missing beyond offline threshold
→ offline
```

Keep the last known position on the map.

Do not remove the UAV simply because telemetry stopped.

## Incident cascade

A deterministic incident may follow:

```text
signal degraded
→ warning
→ telemetry stale
→ connection lost
```

Recovery:

```text
reconnecting
→ transport restored
→ refresh snapshot
→ resume stream
→ connection restored
```

## Cesium movement

Authoritative position comes from telemetry.

Cesium is presentation only.

```text
telemetry samples
→ SampledPositionProperty/interpolation
→ smooth motion
```

Cesium must not become the source of truth.

## Diagnostics

Optional demo diagnostics may show:

```text
Incoming telemetry: N msg/s
State flush rate: N/s
Fleet size: N
Connection: LIVE
```

## Error isolation

- WebSocket failure must not delete fleet state.
- Video failure must not stop telemetry.
- map tile failure must not stop application state.
- one invalid packet must not stop the stream.

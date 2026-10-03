import type { UavTelemetry } from '@horizon/domain'
import { createLatestStateBuffer, type RealtimeTransport } from '@horizon/realtime'
import { parseTelemetryMessage } from '../api/fleet.parsers'
import type { ConnectionStatus, FleetSnapshot } from './fleet.types'

export interface FleetSyncTarget {
  hydrate(snapshot: FleetSnapshot, receivedAt: number): void
  applyTelemetry(batch: UavTelemetry[], receivedAt: number): number
  setConnectionStatus(status: ConnectionStatus): void
}

export interface FleetSyncOptions {
  transport: RealtimeTransport
  loadSnapshot: () => Promise<FleetSnapshot>
  target: FleetSyncTarget
  /** How often buffered telemetry is flushed into application state. */
  flushIntervalMs?: number
  now?: () => number
  logger?: Pick<Console, 'warn'>
}

export interface FleetSync {
  start(): Promise<void>
  stop(): void
}

/**
 * Realtime ingestion pipeline for fleet telemetry:
 * transport → validate/map → latest-state buffer → batched flush → store.
 * Ingestion rate and state update rate are decoupled by the flush interval.
 */
export function createFleetSync({
  transport,
  loadSnapshot,
  target,
  flushIntervalMs = 100,
  now = Date.now,
  logger = console,
}: FleetSyncOptions): FleetSync {
  const buffer = createLatestStateBuffer<UavTelemetry>({
    keyOf: (t) => t.uavId,
    versionOf: (t) => t.timestamp,
  })
  let unsubscribe: (() => void) | null = null
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let hydrated = false
  /** Incremented on every start/stop so async work from a stopped session is discarded. */
  let session = 0

  function flush() {
    const batch = buffer.drain()
    if (batch.length === 0) return
    const ignored = target.applyTelemetry(batch, now())
    if (ignored > 0) logger.warn(`[fleet-sync] ignored telemetry for ${ignored} unknown UAV(s)`)
  }

  function handleMessage(payload: unknown) {
    const result = parseTelemetryMessage(payload)
    if (result.kind === 'invalid')
      logger.warn('[fleet-sync] invalid telemetry message', result.error)
    if (result.kind === 'telemetry') buffer.push(result.telemetry)
  }

  async function start() {
    if (unsubscribe) return
    const current = ++session
    hydrated = false
    target.setConnectionStatus('connecting')

    // Subscribe before loading the snapshot so no update is missed in between;
    // anything older than the snapshot is discarded through buffer baselines.
    unsubscribe = transport.subscribe((event) => {
      if (event.type === 'message') handleMessage(event.payload)
      else if (event.status === 'closed') target.setConnectionStatus('offline')
      else if (event.status === 'open' && hydrated) target.setConnectionStatus('live')
    })

    try {
      await transport.connect()
      const snapshot = await loadSnapshot()
      if (current !== session) return
      target.hydrate(snapshot, now())
      snapshot.telemetry.forEach((t) => {
        buffer.setBaseline(t.uavId, t.timestamp)
      })
      hydrated = true
      flushTimer = setInterval(flush, flushIntervalMs)
      target.setConnectionStatus('live')
    } catch (error) {
      if (current !== session) return
      logger.warn('[fleet-sync] failed to start', error)
      target.setConnectionStatus('offline')
    }
  }

  function stop() {
    session += 1
    unsubscribe?.()
    unsubscribe = null
    if (flushTimer !== null) clearInterval(flushTimer)
    flushTimer = null
    transport.disconnect()
    buffer.clear()
  }

  return { start, stop }
}

import type { UavTelemetry } from '@horizon/domain'
import { createLatestStateBuffer, type RealtimeTransport } from '@horizon/realtime'
import { parseTelemetryMessage } from '../api/fleet.parsers'
import type { ConnectionStatus, FleetSnapshot } from './fleet.types'

export interface FleetSyncTarget {
  hydrate(snapshot: FleetSnapshot, receivedAt: number): void
  applyTelemetry(batch: UavTelemetry[], receivedAt: number): number
  refreshStatuses(now: number): void
  setConnectionStatus(status: ConnectionStatus): void
}

export interface FleetSyncOptions {
  transport: RealtimeTransport
  loadSnapshot: () => Promise<FleetSnapshot>
  target: FleetSyncTarget
  /** How often buffered telemetry is flushed into application state. */
  flushIntervalMs?: number
  /** How often time-dependent status (stale/offline) is re-evaluated. */
  statusIntervalMs?: number
  /** Backoff between reconnect attempts; the last value repeats. */
  reconnectDelaysMs?: readonly number[]
  now?: () => number
  logger?: Pick<Console, 'warn'>
}

export interface FleetSyncStats {
  /** Cumulative realtime messages received. */
  messages: number
  /** Cumulative batched flushes applied to the store. */
  flushes: number
}

export interface FleetSync {
  start(): Promise<void>
  stop(): void
  /** Reloads a fresh snapshot (e.g. after the backend was reset); reconnects on failure. */
  resync(): Promise<void>
  stats(): FleetSyncStats
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
  statusIntervalMs = 1_000,
  reconnectDelaysMs = [1_000, 2_000, 4_000, 8_000],
  now = Date.now,
  logger = console,
}: FleetSyncOptions): FleetSync {
  const buffer = createLatestStateBuffer<UavTelemetry>({
    keyOf: (t) => t.uavId,
    versionOf: (t) => t.timestamp,
  })
  let unsubscribe: (() => void) | null = null
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let statusTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0
  /** Incremented on every start/stop so async work from a stopped session is discarded. */
  let session = 0
  const counters: FleetSyncStats = { messages: 0, flushes: 0 }

  function flush() {
    const batch = buffer.drain()
    if (batch.length === 0) return
    counters.flushes += 1
    const ignored = target.applyTelemetry(batch, now())
    if (ignored > 0) logger.warn(`[fleet-sync] ignored telemetry for ${ignored} unknown UAV(s)`)
  }

  function handleMessage(payload: unknown) {
    counters.messages += 1
    const result = parseTelemetryMessage(payload)
    if (result.kind === 'invalid')
      logger.warn('[fleet-sync] invalid telemetry message', result.error)
    if (result.kind === 'telemetry') buffer.push(result.telemetry)
  }

  /**
   * (Re)establishes the stream, then reconciles with a fresh snapshot: events missed while
   * disconnected are never assumed to have arrived. Older buffered telemetry is discarded
   * through snapshot baselines.
   */
  async function sync(current: number): Promise<boolean> {
    await transport.connect()
    const snapshot = await loadSnapshot()
    if (current !== session) return false
    target.hydrate(snapshot, now())
    snapshot.telemetry.forEach((t) => {
      buffer.setBaseline(t.uavId, t.timestamp)
    })
    reconnectAttempt = 0
    target.setConnectionStatus('live')
    return true
  }

  function scheduleReconnect() {
    if (unsubscribe === null || reconnectTimer !== null) return
    target.setConnectionStatus('reconnecting')
    const delay =
      reconnectDelaysMs[Math.min(reconnectAttempt, reconnectDelaysMs.length - 1)] ?? 1_000
    reconnectAttempt += 1
    const current = session
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      sync(current).catch((error: unknown) => {
        if (current !== session) return
        logger.warn('[fleet-sync] reconnect failed', error)
        scheduleReconnect()
      })
    }, delay)
  }

  async function start() {
    if (unsubscribe) return
    const current = ++session
    target.setConnectionStatus('connecting')

    // Subscribe before loading the snapshot so no update is missed in between.
    unsubscribe = transport.subscribe((event) => {
      if (event.type === 'message') handleMessage(event.payload)
      else if (event.status === 'closed') scheduleReconnect()
    })
    flushTimer = setInterval(flush, flushIntervalMs)
    // Keeps aging UAVs to stale/offline while disconnected; last known state stays visible.
    statusTimer = setInterval(() => {
      target.refreshStatuses(now())
    }, statusIntervalMs)

    try {
      await sync(current)
    } catch (error) {
      if (current !== session) return
      logger.warn('[fleet-sync] failed to connect', error)
      scheduleReconnect()
    }
  }

  function stop() {
    session += 1
    unsubscribe?.()
    unsubscribe = null
    if (flushTimer !== null) clearInterval(flushTimer)
    if (statusTimer !== null) clearInterval(statusTimer)
    if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    flushTimer = null
    statusTimer = null
    reconnectTimer = null
    reconnectAttempt = 0
    transport.disconnect()
    buffer.clear()
  }

  async function resync() {
    if (unsubscribe === null) return
    const current = session
    try {
      await sync(current)
    } catch (error) {
      if (current !== session) return
      logger.warn('[fleet-sync] resync failed', error)
      scheduleReconnect()
    }
  }

  return { start, stop, resync, stats: () => ({ ...counters }) }
}

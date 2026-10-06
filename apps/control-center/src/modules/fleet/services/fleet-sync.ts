import type { UavTelemetry } from '@horizon/domain'
import { createLatestStateBuffer, type RealtimeTransport } from '@horizon/realtime'
import type { PageVisibility } from '@/shared/lib/page-visibility'
import { parseTelemetryMessage } from '../api/fleet.parsers'
import type { ConnectionStatus, FleetSnapshot } from '../model/fleet.types'

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
  /**
   * Called after the link was re-established and the fleet reconciled. Other live state fed by
   * the same stream (e.g. the current mission) missed events too and must reload as well.
   */
  onReconnected?: () => void
  /**
   * Background tabs throttle timers, so telemetry handling falls behind the clock; aging UAVs
   * then would raise false link alerts. While hidden, statuses are not re-evaluated; on return
   * the fleet resyncs and gets `resumeGraceMs` before statuses are judged again.
   */
  visibility?: PageVisibility
  resumeGraceMs?: number
}

export interface FleetSyncStats {
  /** Cumulative realtime messages received (any type). */
  messages: number
  /** Telemetry rejected as out-of-order or duplicate. */
  dropped: number
  /** Telemetry superseded by a newer sample of the same UAV before a flush (latest wins). */
  coalesced: number
  /** UAV updates applied to the store. */
  applied: number
  /** Batched flushes applied to the store. */
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
  onReconnected = () => undefined,
  visibility,
  resumeGraceMs = 3_000,
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
  let unsubscribeVisibility: (() => void) | null = null
  /** Statuses are not judged until then (just back from a background tab). */
  let graceUntil = 0
  /** Incremented on every start/stop so async work from a stopped session is discarded. */
  let session = 0
  const counters: FleetSyncStats = { messages: 0, dropped: 0, coalesced: 0, applied: 0, flushes: 0 }
  /** Accepted telemetry since the last flush, to count what the buffer coalesced. */
  let acceptedSinceFlush = 0

  function flush() {
    const batch = buffer.drain()
    if (batch.length === 0) return
    counters.flushes += 1
    counters.applied += batch.length
    counters.coalesced += acceptedSinceFlush - batch.length
    acceptedSinceFlush = 0
    const ignored = target.applyTelemetry(batch, now())
    if (ignored > 0) logger.warn(`[fleet-sync] ignored telemetry for ${ignored} unknown UAV(s)`)
  }

  function handleMessage(payload: unknown) {
    counters.messages += 1
    const result = parseTelemetryMessage(payload)
    if (result.kind === 'invalid')
      logger.warn('[fleet-sync] invalid telemetry message', result.error)
    if (result.kind !== 'telemetry') return
    if (buffer.push(result.telemetry)) acceptedSinceFlush += 1
    else counters.dropped += 1
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
    acceptedSinceFlush = buffer.pendingCount
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
      sync(current)
        .then((reconciled) => {
          if (reconciled) onReconnected()
        })
        .catch((error: unknown) => {
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
      if (visibility?.hidden() || now() < graceUntil) return
      target.refreshStatuses(now())
    }, statusIntervalMs)
    unsubscribeVisibility =
      visibility?.subscribe((hidden) => {
        if (hidden) return
        graceUntil = now() + resumeGraceMs
        void resync()
      }) ?? null

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
    unsubscribeVisibility?.()
    unsubscribeVisibility = null
    if (flushTimer !== null) clearInterval(flushTimer)
    if (statusTimer !== null) clearInterval(statusTimer)
    if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    flushTimer = null
    statusTimer = null
    reconnectTimer = null
    reconnectAttempt = 0
    transport.disconnect()
    buffer.clear()
    acceptedSinceFlush = 0
  }

  async function resync() {
    if (unsubscribe === null) return
    // This sync supersedes a pending reconnect attempt; don't run a second one after it.
    if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    reconnectTimer = null
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

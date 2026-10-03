import type { UavTelemetry } from '@horizon/domain'

export interface TelemetrySample {
  timestamp: number
  altitude: number
  speed: number
  battery: number
}

/** One sample per second over the last five minutes of telemetry time. */
export const HISTORY_SAMPLE_INTERVAL_MS = 1000
export const HISTORY_WINDOW_MS = 5 * 60_000

/**
 * Rolling per-UAV telemetry history for trend charts, downsampled so its cost does not grow with
 * the stream rate. Non-reactive: readers re-read it when the UAV's live state changes.
 */
export function createTelemetryHistory(
  sampleIntervalMs = HISTORY_SAMPLE_INTERVAL_MS,
  windowMs = HISTORY_WINDOW_MS,
) {
  const byUav = new Map<string, TelemetrySample[]>()

  function record(telemetry: UavTelemetry) {
    let samples = byUav.get(telemetry.uavId)
    if (!samples) {
      samples = []
      byUav.set(telemetry.uavId, samples)
    }
    const last = samples.at(-1)
    // Also drops out-of-order samples (negative delta).
    if (last && telemetry.timestamp - last.timestamp < sampleIntervalMs) return
    samples.push({
      timestamp: telemetry.timestamp,
      altitude: telemetry.position.altitude,
      speed: telemetry.speed,
      battery: telemetry.battery,
    })
    const cutoff = telemetry.timestamp - windowMs
    const keepFrom = samples.findIndex((sample) => sample.timestamp >= cutoff)
    if (keepFrom > 0) samples.splice(0, keepFrom)
  }

  function samples(uavId: string): readonly TelemetrySample[] {
    return byUav.get(uavId) ?? []
  }

  /** Forgets UAVs that are no longer part of the fleet. */
  function retain(uavIds: Iterable<string>) {
    const keep = new Set(uavIds)
    for (const uavId of byUav.keys()) if (!keep.has(uavId)) byUav.delete(uavId)
  }

  return { record, samples, retain }
}

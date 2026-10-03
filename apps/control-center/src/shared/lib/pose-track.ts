export interface Pose {
  latitude: number
  longitude: number
  altitude: number
  /** Degrees clockwise from north. */
  heading: number
}

export interface PoseTrack {
  /**
   * Adds a telemetry sample. `timestamp` is the source clock; `receivedAt` is the local clock.
   * Samples are placed on the local timeline by a linear clock (anchor + rate) so motion follows
   * the source cadence instead of batch-arrival jitter, also when simulated time runs faster
   * than real time (the rate is estimated from arrivals).
   */
  push(timestamp: number, receivedAt: number, pose: Pose): void
  /** Pose at local time `time`; holds the last known pose beyond the newest sample. */
  sampleAt(time: number): Pose | null
}

/**
 * Interpolated consumers (map, video) render this far in the past, so there is always a newer
 * sample to interpolate toward. One value for every view of the same telemetry.
 */
export const RENDER_DELAY_MS = 500

/** Hard re-anchor when the mapped time drifts further than this from arrival time. */
const MAX_DRIFT_MS = 1_000
/** Local time over which the source→local clock rate is re-estimated. */
const RATE_WINDOW_MS = 1_000
/** Rate changes smaller than this are ignored (arrival jitter). */
const RATE_TOLERANCE = 0.05
const MIN_RATE = 0.02
const MAX_RATE = 4
/** Enough samples to cover the render delay even when time runs 8× faster. */
const MAX_SAMPLES = 16

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Interpolates along the shortest arc, result in [0, 360). */
export function lerpHeading(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180
  return (((from + delta * t) % 360) + 360) % 360
}

export function createPoseTrack(): PoseTrack {
  const samples: { time: number; pose: Pose }[] = []
  /** Source→local clock: local = anchor.local + (source - anchor.source) · rate. */
  let anchor: { local: number; source: number } | null = null
  let rate = 1
  let windowStart: { local: number; source: number } | null = null
  let previousRaw: { local: number; source: number } | null = null

  const toLocal = (timestamp: number) =>
    anchor ? anchor.local + (timestamp - anchor.source) * rate : timestamp
  const clampRate = (value: number) => Math.min(MAX_RATE, Math.max(MIN_RATE, value))

  return {
    push(timestamp, receivedAt, pose) {
      if (previousRaw && timestamp <= previousRaw.source) return

      if (!anchor) {
        anchor = { local: receivedAt, source: timestamp }
        windowStart = { local: receivedAt, source: timestamp }
      } else if (Math.abs(toLocal(timestamp) - receivedAt) > MAX_DRIFT_MS) {
        // The source clock speed changed (time scaling, reconnect): re-estimate the rate from
        // the latest arrivals and re-anchor at this sample.
        if (previousRaw && receivedAt > previousRaw.local) {
          rate = clampRate((receivedAt - previousRaw.local) / (timestamp - previousRaw.source))
        }
        anchor = { local: receivedAt, source: timestamp }
        windowStart = { local: receivedAt, source: timestamp }
      } else if (windowStart && receivedAt - windowStart.local >= RATE_WINDOW_MS) {
        // Refine the rate continuously, keeping the mapped timeline continuous.
        const observed = clampRate(
          (receivedAt - windowStart.local) / (timestamp - windowStart.source),
        )
        if (Math.abs(observed - rate) / rate > RATE_TOLERANCE) {
          anchor = { local: toLocal(timestamp), source: timestamp }
          rate = observed
        }
        windowStart = { local: receivedAt, source: timestamp }
      }
      previousRaw = { local: receivedAt, source: timestamp }

      const time = toLocal(timestamp)
      // Never jump: drop samples that would sit after this one on the new timeline.
      while (samples.length > 1 && (samples.at(-1)?.time ?? -Infinity) >= time) samples.pop()
      const last = samples.at(-1)
      if (last && last.time >= time) samples.length = 0
      samples.push({ time, pose })
      if (samples.length > MAX_SAMPLES) samples.shift()
    },

    sampleAt(time) {
      const first = samples[0]
      const last = samples.at(-1)
      if (!first || !last) return null
      if (time <= first.time) return first.pose
      if (time >= last.time) return last.pose

      for (let i = 1; i < samples.length; i++) {
        const next = samples[i]
        const prev = samples[i - 1]
        if (!next || !prev || time > next.time) continue
        const t = (time - prev.time) / (next.time - prev.time)
        return {
          latitude: lerp(prev.pose.latitude, next.pose.latitude, t),
          longitude: lerp(prev.pose.longitude, next.pose.longitude, t),
          altitude: lerp(prev.pose.altitude, next.pose.altitude, t),
          heading: lerpHeading(prev.pose.heading, next.pose.heading, t),
        }
      }
      return last.pose
    },
  }
}

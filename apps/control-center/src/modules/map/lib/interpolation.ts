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
   * Samples are placed on the local timeline by a per-track offset so motion follows the
   * source cadence instead of batch-arrival jitter.
   */
  push(timestamp: number, receivedAt: number, pose: Pose): void
  /** Pose at local time `time`; holds the last known pose beyond the newest sample. */
  sampleAt(time: number): Pose | null
}

/** Re-anchor the source→local offset when it drifts further than this (e.g. time scaling). */
const MAX_OFFSET_DRIFT_MS = 1_000
const MAX_SAMPLES = 6

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Interpolates along the shortest arc, result in [0, 360). */
export function lerpHeading(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180
  return (((from + delta * t) % 360) + 360) % 360
}

export function createPoseTrack(): PoseTrack {
  const samples: { time: number; pose: Pose }[] = []
  let offset: number | null = null

  return {
    push(timestamp, receivedAt, pose) {
      const last = samples.at(-1)
      if (offset === null || Math.abs(timestamp + offset - receivedAt) > MAX_OFFSET_DRIFT_MS) {
        offset = receivedAt - timestamp
        // A new anchor invalidates the old timeline; continue from the last rendered pose.
        samples.length = 0
        if (last) samples.push({ time: receivedAt - 1, pose: last.pose })
      }
      const time = timestamp + offset
      if (last && time <= last.time) return
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

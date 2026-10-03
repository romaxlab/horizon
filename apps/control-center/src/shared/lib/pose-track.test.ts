import { describe, expect, it } from 'vitest'
import { createPoseTrack, lerpHeading, type Pose } from './pose-track'

const pose = (latitude: number, heading = 0, altitude = 100): Pose => ({
  latitude,
  longitude: 54,
  altitude,
  heading,
})

describe('lerpHeading', () => {
  it('takes the shortest arc across north', () => {
    expect(lerpHeading(350, 10, 0.5)).toBeCloseTo(0)
    expect(lerpHeading(10, 350, 0.25)).toBeCloseTo(5)
    expect(lerpHeading(90, 180, 0.5)).toBeCloseTo(135)
  })
})

describe('createPoseTrack', () => {
  it('returns null without samples and holds a single sample', () => {
    const track = createPoseTrack()
    expect(track.sampleAt(0)).toBeNull()
    track.push(1_000, 5_000, pose(24))
    expect(track.sampleAt(4_000)).toEqual(pose(24))
    expect(track.sampleAt(9_000)).toEqual(pose(24))
  })

  it('interpolates on the source cadence despite batched arrival', () => {
    const track = createPoseTrack()
    // Source ticks every 250 ms; batches arrive late by varying amounts.
    track.push(0, 10_000, pose(24.0, 0, 100))
    track.push(250, 10_300, pose(24.1, 90, 200))
    track.push(500, 10_510, pose(24.2, 180, 300))

    expect(track.sampleAt(10_125)).toMatchObject({ latitude: 24.05, altitude: 150, heading: 45 })
    expect(track.sampleAt(10_375)?.latitude).toBeCloseTo(24.15)
  })

  it('holds the last known pose during telemetry loss', () => {
    const track = createPoseTrack()
    track.push(0, 1_000, pose(24))
    track.push(250, 1_250, pose(25))
    expect(track.sampleAt(60_000)).toEqual(pose(25))
  })

  it('ignores out-of-order samples', () => {
    const track = createPoseTrack()
    track.push(500, 1_500, pose(25))
    track.push(250, 1_510, pose(99))
    expect(track.sampleAt(2_000)).toEqual(pose(25))
  })

  it('re-anchors after a clock jump and glides to the new position instead of snapping', () => {
    const track = createPoseTrack()
    track.push(0, 1_000, pose(24))
    track.push(250, 1_250, pose(24.5))
    // Source clock jumps ahead relative to the local clock (e.g. reconnect or time scaling).
    track.push(20_000, 3_000, pose(26))

    expect(track.sampleAt(1_250)).toEqual(pose(24.5))
    expect(track.sampleAt(2_125)?.latitude).toBeCloseTo(25.25)
    expect(track.sampleAt(3_000)).toEqual(pose(26))
  })

  it('moves evenly when simulated time runs 8× faster than real time', () => {
    const track = createPoseTrack()
    // Source ticks of 800 ms arrive every 100 ms of local time (8× time scale, 10 Hz flushes).
    for (let i = 0; i <= 40; i++) track.push(i * 800, 10_000 + i * 100, pose(24 + i * 0.001))

    const positions: number[] = []
    for (let t = 12_600; t <= 13_900; t += 16) positions.push(track.sampleAt(t)?.latitude ?? 0)
    const steps = positions.slice(1).map((p, i) => p - (positions[i] ?? p))
    expect(Math.min(...steps)).toBeGreaterThan(0)
    // Every frame advances by about the same amount: no stalls and no jumps.
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.5)
  })
})

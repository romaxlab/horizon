import { describe, expect, it } from 'vitest'
import { distanceMeters } from '@horizon/domain'
import { DEMO_BASE, DEMO_MISSION, DEMO_PARKING } from './demo'
import type { SimulatorMessage, TelemetryDto } from './protocol'
import { createSimulator, type SimulatorOptions } from './simulator'

const START = Date.UTC(2026, 0, 1)

function record(options: SimulatorOptions = {}) {
  const simulator = createSimulator({ startTime: START, ...options })
  const messages: SimulatorMessage[] = []
  simulator.subscribe((message) => messages.push(message))
  return { simulator, messages }
}

function telemetryOf(messages: SimulatorMessage[], uavId: string): TelemetryDto[] {
  return messages.filter((m) => m.data.uav_id === uavId).map((m) => m.data)
}

/** Steps in 1 s increments until `done` or the limit, returning elapsed simulated seconds. */
function runUntil(step: (ms: number) => void, done: () => boolean, limitSec: number): number {
  for (let sec = 1; sec <= limitSec; sec++) {
    step(1000)
    if (done()) return sec
  }
  throw new Error(`Condition not met within ${limitSec} s`)
}

describe('createSimulator', () => {
  it('generates a 24-UAV fleet parked in standby', () => {
    const snapshot = createSimulator({ startTime: START }).getFleetSnapshot()

    expect(snapshot.server_time).toBe(START)
    expect(snapshot.uavs).toHaveLength(24)
    expect(new Set(snapshot.uavs.map((u) => u.id)).size).toBe(24)
    expect(snapshot.telemetry.every((t) => t.mission_id === null && t.speed_mps === 0)).toBe(true)
  })

  it('parks the fleet in an even grid on the stadium pitch, aligned with the pitch', () => {
    const { telemetry } = createSimulator({ startTime: START }).getFleetSnapshot()
    const at = (i: number) => telemetry[i] ?? telemetry[0]
    const spacing = (a: number, b: number) =>
      distanceMeters(
        { latitude: at(a)?.lat ?? 0, longitude: at(a)?.lon ?? 0 },
        {
          latitude: at(b)?.lat ?? 0,
          longitude: at(b)?.lon ?? 0,
        },
      )

    // 6 columns × 4 rows, 15 m apart in both directions: 75 × 45 m, inside the ≈117 × 74 m pitch.
    expect(spacing(0, 1)).toBeCloseTo(15, 0)
    expect(spacing(0, 6)).toBeCloseTo(15, 0)
    expect(spacing(7, 8)).toBeCloseTo(15, 0)
    expect(spacing(0, 5)).toBeCloseTo(75, 0)
    expect(spacing(0, 18)).toBeCloseTo(45, 0)
    const meanLat = telemetry.reduce((sum, t) => sum + t.lat, 0) / telemetry.length
    const meanLon = telemetry.reduce((sum, t) => sum + t.lon, 0) / telemetry.length
    expect(distanceMeters({ latitude: meanLat, longitude: meanLon }, DEMO_BASE)).toBeLessThan(0.5)
    const parkedHeading = (DEMO_PARKING.axisBearing + 180) % 360
    expect(telemetry.every((t) => t.heading_deg === parkedHeading)).toBe(true)
  })

  it('replays identically for the same seed', () => {
    const a = record({ seed: 7 })
    const b = record({ seed: 7 })
    for (const { simulator } of [a, b]) {
      simulator.step(5_000)
      simulator.dispatch({ type: 'startDemoMission' })
      simulator.step(60_000)
    }

    expect(a.messages.length).toBeGreaterThan(0)
    expect(a.messages).toEqual(b.messages)
    expect(a.simulator.getFleetSnapshot()).toEqual(b.simulator.getFleetSnapshot())
  })

  it('differs between seeds', () => {
    const a = createSimulator({ seed: 1, startTime: START }).getFleetSnapshot()
    const b = createSimulator({ seed: 2, startTime: START }).getFleetSnapshot()
    expect(a.telemetry.map((t) => t.battery_pct)).not.toEqual(b.telemetry.map((t) => t.battery_pct))
  })

  it('streams standby UAVs at a lower rate than flying ones', () => {
    const { simulator, messages } = record()
    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(10_000)

    const missionUav = simulator.getFleetSnapshot().telemetry.find((t) => t.mission_id !== null)
    const standbyUav = simulator.getFleetSnapshot().telemetry.find((t) => t.mission_id === null)
    expect(telemetryOf(messages, missionUav?.uav_id ?? '')).toHaveLength(40)
    expect(telemetryOf(messages, standbyUav?.uav_id ?? '')).toHaveLength(10)
  })

  it('emits monotonically increasing timestamps per UAV', () => {
    const { simulator, messages } = record()
    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(20_000)

    const stamps = telemetryOf(messages, 'uav-01').map((t) => t.ts)
    expect(stamps).toEqual([...stamps].sort((x, y) => x - y))
    expect(new Set(stamps).size).toBe(stamps.length)
  })

  it('runs the demo mission: climb, scan, return and park', () => {
    const { simulator, messages } = record()
    expect(simulator.dispatch({ type: 'startDemoMission' })).toEqual({ ok: true })

    const assigned = simulator.getFleetSnapshot().telemetry.filter((t) => t.mission_id !== null)
    expect(assigned).toHaveLength(DEMO_MISSION.uavCount)

    simulator.step(60_000)
    const airborne = simulator.getFleetSnapshot().telemetry.filter((t) => t.mission_id !== null)
    expect(airborne.every((t) => t.alt_m === DEMO_MISSION.altitude && t.speed_mps > 0)).toBe(true)

    const allParked = () =>
      simulator.getFleetSnapshot().telemetry.every((t) => t.mission_id === null)
    const elapsed = runUntil(
      (ms) => {
        simulator.step(ms)
      },
      allParked,
      60 * 60,
    )
    expect(elapsed).toBeGreaterThan(5 * 60)

    const inMission = telemetryOf(messages, 'uav-01').filter((t) => t.mission_id !== null)
    const progress = inMission.map((t) => t.waypoint_index ?? -1)
    expect(Math.min(...progress)).toBe(0)
    expect(progress).toEqual([...progress].sort((x, y) => x - y))
    const parked = simulator.getFleetSnapshot().telemetry.find((t) => t.uav_id === 'uav-01')
    expect(parked).toMatchObject({
      alt_m: 0,
      speed_mps: 0,
      heading_deg: (DEMO_PARKING.axisBearing + 180) % 360,
      waypoint_index: null,
    })
  })

  it('allows a single active mission at a time', () => {
    const simulator = createSimulator({ startTime: START })
    simulator.dispatch({ type: 'startDemoMission' })

    expect(simulator.dispatch({ type: 'startDemoMission' })).toEqual({
      ok: false,
      reason: 'A mission is already active',
    })
  })

  it('resets to the initial fleet state while keeping time monotonic', () => {
    const simulator = createSimulator({ startTime: START })
    const initial = simulator.getFleetSnapshot()
    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(30_000)
    simulator.dispatch({ type: 'reset' })

    const reset = simulator.getFleetSnapshot()
    expect(reset.server_time).toBe(START + 30_000)
    const ignoringTime = (t: TelemetryDto) => ({ ...t, ts: 0 })
    expect(reset.telemetry.map(ignoringTime)).toEqual(initial.telemetry.map(ignoringTime))
  })
})

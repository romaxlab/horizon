import { describe, expect, it } from 'vitest'
import { distanceMeters, isPointInPolygon, pathEntersPolygon } from '@horizon/domain'
import { DEMO_BASE, DEMO_GEOFENCES, DEMO_MISSION, DEMO_PARKING, STRESS_FLEET_SIZE } from '../demo'
import type { MissionDto, SimulatorMessage, TelemetryDto } from '../protocol'
import { createSimulator, type SimulatorOptions } from '../simulator'

const START = Date.UTC(2026, 0, 1)

function record(options: SimulatorOptions = {}) {
  const simulator = createSimulator({ startTime: START, ...options })
  const messages: SimulatorMessage[] = []
  simulator.subscribe((message) => messages.push(message))
  return { simulator, messages }
}

function telemetryOf(messages: SimulatorMessage[], uavId: string): TelemetryDto[] {
  return messages.flatMap((m) =>
    m.type === 'telemetry' && m.data.uav_id === uavId ? [m.data] : [],
  )
}

function missionMessages(messages: SimulatorMessage[]): MissionDto[] {
  return messages.flatMap((m) => (m.type === 'mission' ? [m.data] : []))
}

const demoArea = {
  polygon: DEMO_MISSION.area.polygon.map((p) => ({ lat: p.latitude, lon: p.longitude })),
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

  it('plans a mission with the healthiest standby UAVs without launching it', () => {
    const { simulator, messages } = record()
    const plan = simulator.planMission({
      name: 'Scan',
      area: demoArea,
      altitude_m: 100,
      uav_count: 4,
    })
    if (!plan.ok) throw new Error(plan.reason)

    expect(plan.mission).toMatchObject({ status: 'planned', name: 'Scan', altitude_m: 100 })
    expect(plan.mission.routes).toHaveLength(4)
    const batteries = simulator.getFleetSnapshot().telemetry
    const assigned = plan.mission.assigned_uav_ids.map(
      (id) => batteries.find((t) => t.uav_id === id)?.battery_pct ?? 0,
    )
    expect(assigned).toEqual([...assigned].sort((a, b) => b - a))
    expect(simulator.getActiveMission()).toBeNull()
    expect(missionMessages(messages)).toEqual([])
  })

  it('rejects plans it cannot fulfil', () => {
    const simulator = createSimulator({ startTime: START })
    expect(
      simulator.planMission({ name: 'x', area: demoArea, altitude_m: 120, uav_count: 99 }),
    ).toMatchObject({ ok: false })
    const tiny = { polygon: demoArea.polygon.map((p) => ({ lat: p.lat * 1, lon: 54.37 })) }
    expect(
      simulator.planMission({ name: 'x', area: tiny, altitude_m: 120, uav_count: 2 }),
    ).toMatchObject({ ok: false })
  })

  it('launches a planned mission, streams its state and completes it', () => {
    const { simulator, messages } = record()
    const plan = simulator.planMission({
      name: 'Scan',
      area: demoArea,
      altitude_m: 120,
      uav_count: 2,
    })
    if (!plan.ok) throw new Error(plan.reason)

    expect(simulator.dispatch({ type: 'launchMission', missionId: plan.mission.id })).toEqual({
      ok: true,
    })
    expect(simulator.dispatch({ type: 'launchMission', missionId: plan.mission.id })).toMatchObject(
      {
        ok: false,
      },
    )
    expect(simulator.getActiveMission()).toMatchObject({ id: plan.mission.id, status: 'active' })

    runUntil(
      (ms) => {
        simulator.step(ms)
      },
      () => simulator.getActiveMission()?.status === 'completed',
      60 * 60,
    )
    expect(missionMessages(messages).map((m) => m.status)).toEqual(['active', 'completed'])
  })

  it('runs the demo mission through the same plan/launch path', () => {
    const { simulator, messages } = record()
    simulator.dispatch({ type: 'startDemoMission' })
    expect(missionMessages(messages)).toMatchObject([
      { id: DEMO_MISSION.id, status: 'active', assigned_uav_ids: expect.any(Array) as unknown },
    ])
  })

  it('aborts a mission: UAVs return home and the mission is marked aborted', () => {
    const { simulator, messages } = record()
    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(60_000)

    expect(simulator.dispatch({ type: 'abortMission', missionId: DEMO_MISSION.id })).toEqual({
      ok: true,
    })
    expect(simulator.getActiveMission()?.status).toBe('aborted')
    expect(missionMessages(messages).map((m) => m.status)).toEqual(['active', 'aborted'])
    simulator.step(1_000)
    const flying = simulator.getFleetSnapshot().telemetry.filter((t) => t.mission_id !== null)
    expect(
      flying.every((t) => t.flight_phase === 'returning' && t.return_reason === 'aborted'),
    ).toBe(true)

    runUntil(
      (ms) => {
        simulator.step(ms)
      },
      () => simulator.getFleetSnapshot().telemetry.every((t) => t.flight_phase === 'parked'),
      30 * 60,
    )
    expect(simulator.dispatch({ type: 'abortMission', missionId: DEMO_MISSION.id })).toMatchObject({
      ok: false,
    })
  })

  it('sends a UAV home on low battery with enough charge to land', () => {
    const { simulator } = record()
    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(120_000)
    const [first] = simulator.getActiveMission()?.assigned_uav_ids ?? []
    if (!first) throw new Error('expected an assigned UAV')
    simulator.dispatch({ type: 'setBattery', uavId: first, batteryPct: 15 })
    simulator.step(500)

    const uav = () => simulator.getFleetSnapshot().telemetry.find((t) => t.uav_id === first)
    expect(uav()).toMatchObject({ flight_phase: 'returning', return_reason: 'low-battery' })
    expect(simulator.getActiveMission()?.status).toBe('active')

    runUntil(
      (ms) => {
        simulator.step(ms)
      },
      () => uav()?.flight_phase === 'parked',
      30 * 60,
    )
    expect(uav()?.battery_pct).toBeGreaterThan(0)
  })

  it('returns on a separate layer above the scan altitude', () => {
    const { simulator, messages } = record()
    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(60_000)
    simulator.dispatch({ type: 'abortMission', missionId: DEMO_MISSION.id })
    simulator.step(30_000)

    const returning = telemetryOf(messages, 'uav-01').filter(
      (t) => t.flight_phase === 'returning' && t.speed_mps > 10,
    )
    expect(returning.length).toBeGreaterThan(0)
    expect(returning.every((t) => t.alt_m >= DEMO_MISSION.altitude + 19.9)).toBe(true)
  })

  it('stops telemetry for a lost UAV; snapshots keep its last reported state', () => {
    const { simulator, messages } = record()
    simulator.step(2_000)
    simulator.dispatch({ type: 'setTelemetryLoss', uavId: 'uav-05', lost: true })
    const before = telemetryOf(messages, 'uav-05').length
    simulator.step(5_000)

    expect(telemetryOf(messages, 'uav-05')).toHaveLength(before)
    const lastTs = telemetryOf(messages, 'uav-05').at(-1)?.ts
    expect(simulator.getFleetSnapshot().telemetry.find((t) => t.uav_id === 'uav-05')?.ts).toBe(
      lastTs,
    )

    simulator.dispatch({ type: 'setTelemetryLoss', uavId: 'uav-05', lost: false })
    simulator.step(2_000)
    expect(telemetryOf(messages, 'uav-05').length).toBeGreaterThan(before)
  })

  it('degrades a UAV signal below the warning threshold', () => {
    const simulator = createSimulator({ startTime: START })
    simulator.dispatch({ type: 'setSignalDegraded', uavId: 'uav-02', degraded: true })
    simulator.step(1_000)
    const signal = simulator.getFleetSnapshot().telemetry.find((t) => t.uav_id === 'uav-02')
    expect(signal?.signal_pct).toBeLessThan(35)
  })

  it('drops all messages during a network outage and notifies listeners', () => {
    const { simulator, messages } = record()
    const states: boolean[] = []
    simulator.subscribeNetwork((up) => states.push(up))

    simulator.dispatch({ type: 'setNetwork', up: false })
    const count = messages.length
    simulator.step(3_000)
    expect(messages).toHaveLength(count)
    expect(simulator.networkUp).toBe(false)

    simulator.dispatch({ type: 'setNetwork', up: true })
    simulator.step(1_000)
    expect(messages.length).toBeGreaterThan(count)
    expect(states).toEqual([false, true])
  })

  it('completes a mission only after all its UAVs have landed', () => {
    const { simulator } = record()
    simulator.dispatch({ type: 'startDemoMission' })
    const phases = () =>
      simulator.getFleetSnapshot().telemetry.filter((t) => t.mission_id === DEMO_MISSION.id)
    runUntil(
      (ms) => {
        simulator.step(ms)
      },
      () => phases().every((t) => t.flight_phase === 'returning'),
      60 * 60,
    )
    expect(simulator.getActiveMission()?.status).toBe('active')

    runUntil(
      (ms) => {
        simulator.step(ms)
      },
      () => simulator.getActiveMission()?.status === 'completed',
      60 * 60,
    )
    expect(simulator.getFleetSnapshot().telemetry.every((t) => t.flight_phase === 'parked')).toBe(
      true,
    )
  })

  it('applies presets: NORMAL starts the demo mission, STRESS uses a large fleet', () => {
    const simulator = createSimulator({ startTime: START })
    expect(simulator.dispatch({ type: 'applyPreset', preset: 'normal' })).toEqual({ ok: true })
    expect(simulator.getActiveMission()?.status).toBe('active')

    simulator.dispatch({ type: 'applyPreset', preset: 'stress' })
    expect(simulator.fleetSize).toBe(STRESS_FLEET_SIZE)
    expect(simulator.getFleetSnapshot().uavs).toHaveLength(STRESS_FLEET_SIZE)
    expect(simulator.getActiveMission()?.status).toBe('active')
  })

  it('runs the INCIDENT preset as a deterministic failure sequence', () => {
    const run = () => {
      const { simulator, messages } = record()
      const network: boolean[] = []
      simulator.subscribeNetwork((up) => network.push(up))
      simulator.dispatch({ type: 'applyPreset', preset: 'incident' })
      simulator.step(90_000)
      const [first] = simulator.getActiveMission()?.assigned_uav_ids ?? []
      return { simulator, messages, network, first }
    }
    const a = run()
    expect(a.network).toEqual([false, true])
    const signal = telemetryOf(a.messages, a.first ?? '').map((t) => t.signal_pct)
    expect(Math.min(...signal)).toBeLessThan(35)
    expect(a.messages).toEqual(run().messages)
  })

  it('completes the active mission on demand; UAVs return and land', () => {
    const simulator = createSimulator({ startTime: START })
    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(30_000)
    expect(simulator.dispatch({ type: 'completeMission' })).toEqual({ ok: true })
    runUntil(
      (ms) => {
        simulator.step(ms)
      },
      () => simulator.getActiveMission()?.status === 'completed',
      30 * 60,
    )
  })

  it('plans scan lines and transit around no-fly zones instead of through them', () => {
    const { simulator } = record()
    // Overlaps the Marina zone, and transit from the base would cut across the helipad zone.
    const area = {
      polygon: [
        { lat: 24.436, lon: 54.345 },
        { lat: 24.468, lon: 54.345 },
        { lat: 24.468, lon: 54.356 },
        { lat: 24.436, lon: 54.356 },
      ],
    }
    const result = simulator.planMission({ name: 'West', area, altitude_m: 120, uav_count: 3 })
    if (!result.ok) throw new Error(result.reason)
    const homes = new Map(
      simulator
        .getFleetSnapshot()
        .telemetry.map((t) => [t.uav_id, { latitude: t.lat, longitude: t.lon }]),
    )
    for (const route of result.mission.routes) {
      const home = homes.get(route.uav_id)
      if (!home) throw new Error('unknown UAV')
      const path = [
        home,
        ...route.waypoints.map((w) => ({ latitude: w.lat, longitude: w.lon })),
        home,
      ]
      for (const zone of DEMO_GEOFENCES) {
        expect(pathEntersPolygon(path.slice(0, -1), zone.polygon)).toBe(false)
      }
    }
  })

  it('flies a detoured mission and its return without entering a no-fly zone', () => {
    const { simulator, messages } = record()
    // Behind the helipad zone as seen from the base.
    const behindHelipad = {
      polygon: [
        { lat: 24.436, lon: 54.345 },
        { lat: 24.44, lon: 54.345 },
        { lat: 24.44, lon: 54.353 },
        { lat: 24.436, lon: 54.353 },
      ],
    }
    const plan = simulator.planMission({
      name: 'South',
      area: behindHelipad,
      altitude_m: 60,
      uav_count: 1,
    })
    if (!plan.ok) throw new Error(plan.reason)
    simulator.dispatch({ type: 'launchMission', missionId: plan.mission.id })
    runUntil(
      (ms) => {
        simulator.step(ms)
      },
      () => simulator.getActiveMission()?.status === 'completed',
      3600,
    )
    const flown = telemetryOf(messages, plan.mission.assigned_uav_ids[0] ?? '')
    expect(flown.some((t) => t.flight_phase === 'returning')).toBe(true)
    for (const zone of DEMO_GEOFENCES) {
      expect(
        flown.some((t) => isPointInPolygon({ latitude: t.lat, longitude: t.lon }, zone.polygon)),
      ).toBe(false)
    }
  })

  it('rejects an area that lies entirely inside a no-fly zone, naming the zone', () => {
    const { simulator } = record()
    const marina = DEMO_GEOFENCES.find((zone) => zone.id === 'nfz-marina')
    const inside = {
      polygon: [
        { lat: 24.4645, lon: 54.3515 },
        { lat: 24.4665, lon: 54.3515 },
        { lat: 24.4665, lon: 54.354 },
        { lat: 24.4645, lon: 54.354 },
      ],
    }
    expect(
      simulator.planMission({ name: 'x', area: inside, altitude_m: 40, uav_count: 1 }),
    ).toMatchObject({ ok: false, geofenceIds: [marina?.id] })
  })

  it('holds a mission UAV in the nearest no-fly zone until the breach is switched off', () => {
    const { simulator } = record()
    const breach = (uavId: string, active: boolean) =>
      simulator.dispatch({ type: 'setGeofenceBreach', uavId, active })
    expect(breach('uav-01', true)).toMatchObject({ ok: false })
    simulator.dispatch({ type: 'startDemoMission' })
    const uavId = simulator.getActiveMission()?.assigned_uav_ids[0] ?? ''
    simulator.step(60_000)
    expect(breach(uavId, true)).toEqual({ ok: true })
    expect(simulator.getInjections(uavId)?.geofenceBreach).toBe(true)

    const position = () => {
      const t = simulator.getFleetSnapshot().telemetry.find((x) => x.uav_id === uavId)
      return { latitude: t?.lat ?? 0, longitude: t?.lon ?? 0 }
    }
    const inAnyZone = () => DEMO_GEOFENCES.some((z) => isPointInPolygon(position(), z.polygon))
    const step = (ms: number) => {
      simulator.step(ms)
    }
    runUntil(step, inAnyZone, 600)
    simulator.step(30_000)
    expect(inAnyZone()).toBe(true)

    breach(uavId, false)
    expect(simulator.getInjections(uavId)?.geofenceBreach).toBe(false)
    runUntil(step, () => !inAnyZone(), 600)
    const phase = simulator.getFleetSnapshot().telemetry.find((x) => x.uav_id === uavId)
    expect(phase?.flight_phase).toBe('mission')
  })

  it('sends a heartbeat every 5 s of simulated time', () => {
    const { simulator, messages } = record()
    simulator.step(20_000)
    const beats = messages.flatMap((m) => (m.type === 'heartbeat' ? [m.data.server_time] : []))
    expect(beats).toEqual([START + 5_000, START + 10_000, START + 15_000, START + 20_000])
  })

  it('reports whether there is anything to reset', () => {
    const { simulator } = record()
    expect(simulator.pristine).toBe(true)
    simulator.dispatch({ type: 'setSignalDegraded', uavId: 'uav-01', degraded: true })
    expect(simulator.pristine).toBe(false)
    simulator.dispatch({ type: 'reset' })
    expect(simulator.pristine).toBe(true)
    simulator.dispatch({ type: 'startDemoMission' })
    expect(simulator.pristine).toBe(false)
  })

  it('injects low battery reversibly, restoring the previous level', () => {
    const { simulator } = record()
    const level = () => simulator.getFleetSnapshot().telemetry.find((t) => t.uav_id === 'uav-01')
    const before = level()?.battery_pct ?? 0
    simulator.dispatch({ type: 'setLowBattery', uavId: 'uav-01', low: true })
    expect(level()?.battery_pct).toBe(18)
    expect(simulator.getInjections('uav-01')).toMatchObject({ lowBattery: true })
    simulator.dispatch({ type: 'setLowBattery', uavId: 'uav-01', low: false })
    expect(level()?.battery_pct).toBe(before)
    expect(simulator.getInjections('uav-01')).toEqual({
      lowBattery: false,
      signalDegraded: false,
      telemetryLost: false,
      geofenceBreach: false,
    })
  })
})

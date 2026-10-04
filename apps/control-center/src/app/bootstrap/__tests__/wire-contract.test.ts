import { createSimulator, DEMO_MISSION, type SimulatorMessage } from '@horizon/simulator'
import { describe, expect, it } from 'vitest'
import { parseGeofences } from '@/modules/airspace'
import { parseFleetSnapshot, parseTelemetryMessage } from '@/modules/fleet'
import { parseMission, parseMissionMessage } from '@/modules/mission-planning'

/*
 * The simulator (the fake backend) and the app's schemas describe the same wire protocol twice.
 * This keeps them in step: everything the simulator sends — REST payloads and every realtime
 * message type, across the states a demo goes through — must pass the app's validation.
 */

const START = Date.UTC(2026, 0, 1)
const target = { lat: 24.456, lon: 54.386 }

function run() {
  const simulator = createSimulator({ startTime: START })
  const messages: SimulatorMessage[] = []
  simulator.subscribe((message) => messages.push(message))
  return { simulator, messages }
}

describe('simulator ↔ app wire contract', () => {
  it('every realtime message parses: telemetry, missions, heartbeats', () => {
    const { simulator, messages } = run()
    // Incident preset: active mission, degraded link, low battery, telemetry loss, outage.
    simulator.dispatch({ type: 'applyPreset', preset: 'incident' })
    simulator.step(120_000)
    simulator.dispatch({ type: 'completeMission' })
    simulator.step(600_000)

    const types = new Set(messages.map((m) => m.type))
    expect(types).toEqual(new Set(['telemetry', 'mission', 'heartbeat']))
    for (const message of messages) {
      // Each consumer accepts its own type and ignores the others without an error.
      const telemetry = parseTelemetryMessage(structuredClone(message))
      const mission = parseMissionMessage(structuredClone(message))
      if (message.type === 'telemetry') expect(telemetry.kind).toBe('telemetry')
      else expect(telemetry.kind).toBe('other')
      if (message.type === 'mission') expect(mission).not.toBeNull()
      else expect(mission).toBeNull()
    }
  })

  it('REST payloads parse: snapshot (also with lost telemetry), geofences, planned missions of every type', () => {
    const { simulator } = run()
    simulator.dispatch({ type: 'startDemoMission' })
    simulator.step(30_000)
    const uavId = simulator.getActiveMission()?.assigned_uav_ids[0] ?? ''
    simulator.dispatch({ type: 'setTelemetryLoss', uavId, lost: true })
    simulator.step(10_000)

    expect(parseFleetSnapshot(structuredClone(simulator.getFleetSnapshot())).uavs).toHaveLength(24)
    expect(parseGeofences(structuredClone(simulator.getGeofences())).length).toBeGreaterThan(0)
    const active = simulator.getActiveMission()
    expect(parseMission(structuredClone(active)).name).toBe(DEMO_MISSION.name)

    const common = { altitude_m: 60, uav_count: 2 }
    const requests = [
      {
        ...common,
        type: 'area_scan' as const,
        name: 'Scan',
        area: {
          polygon: [
            { lat: 24.452, lon: 54.382 },
            { lat: 24.452, lon: 54.39 },
            { lat: 24.459, lon: 54.39 },
            { lat: 24.459, lon: 54.382 },
          ],
        },
      },
      {
        ...common,
        type: 'patrol' as const,
        name: 'Patrol',
        laps: 2,
        area: {
          polygon: [
            { lat: 24.452, lon: 54.382 },
            { lat: 24.46, lon: 54.386 },
            { lat: 24.452, lon: 54.39 },
          ],
        },
      },
      {
        ...common,
        type: 'point_inspection' as const,
        name: 'Inspect',
        laps: 1,
        radius_m: 80,
        area: { polygon: [target] },
      },
    ]
    for (const request of requests) {
      const plan = simulator.planMission(request)
      expect(plan.ok, `${request.type}: ${plan.ok ? '' : plan.reason}`).toBe(true)
      if (plan.ok) expect(parseMission(structuredClone(plan.mission)).type).toBe(request.type)
    }
  })
})

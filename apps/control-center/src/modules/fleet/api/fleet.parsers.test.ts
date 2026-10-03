import { describe, expect, it } from 'vitest'
import { parseFleetSnapshot, parseTelemetryMessage, FleetPayloadError } from './fleet.parsers'

const telemetryDto = {
  uav_id: 'uav-01',
  ts: 1_000,
  lat: 24.45,
  lon: 54.38,
  alt_m: 120,
  speed_mps: 14,
  heading_deg: 90,
  battery_pct: 80.5,
  signal_pct: 95,
  gps_sats: 14,
  mission_id: 'mission-1',
  waypoint_index: 3,
  flight_phase: 'mission',
  return_reason: null,
}

describe('parseTelemetryMessage', () => {
  it('maps a valid telemetry DTO to the domain model', () => {
    expect(parseTelemetryMessage({ type: 'telemetry', data: telemetryDto })).toEqual({
      kind: 'telemetry',
      telemetry: {
        uavId: 'uav-01',
        timestamp: 1_000,
        position: { latitude: 24.45, longitude: 54.38, altitude: 120 },
        speed: 14,
        heading: 90,
        battery: 80.5,
        signal: 95,
        gpsSatellites: 14,
        missionId: 'mission-1',
        currentWaypoint: 3,
        flightPhase: 'mission',
        returnReason: null,
      },
    })
  })

  it('rejects invalid telemetry', () => {
    for (const data of [
      { ...telemetryDto, lat: 91 },
      { ...telemetryDto, battery_pct: -1 },
      { ...telemetryDto, uav_id: undefined },
      { ...telemetryDto, ts: '1000' },
    ]) {
      expect(parseTelemetryMessage({ type: 'telemetry', data }).kind).toBe('invalid')
    }
    expect(parseTelemetryMessage('garbage').kind).toBe('invalid')
  })

  it('leaves other message types to other consumers', () => {
    expect(parseTelemetryMessage({ type: 'mission', data: {} })).toEqual({ kind: 'other' })
  })
})

describe('parseFleetSnapshot', () => {
  it('maps UAVs and telemetry', () => {
    const snapshot = parseFleetSnapshot({
      server_time: 2_000,
      uavs: [
        {
          id: 'uav-01',
          name: 'UAV-01',
          model: 'Falcon X4',
          callsign: 'HZN01',
          has_camera: true,
          has_thermal_camera: false,
        },
      ],
      telemetry: [telemetryDto],
    })

    expect(snapshot.serverTime).toBe(2_000)
    expect(snapshot.uavs[0]?.capabilities).toEqual({ camera: true, thermalCamera: false })
    expect(snapshot.telemetry[0]?.uavId).toBe('uav-01')
  })

  it('throws on an invalid payload', () => {
    expect(() => parseFleetSnapshot({ uavs: 'nope' })).toThrow(FleetPayloadError)
  })
})

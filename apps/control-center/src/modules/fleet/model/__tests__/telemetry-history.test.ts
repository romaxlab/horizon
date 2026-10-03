import { describe, expect, it } from 'vitest'
import { telemetry } from '../fleet.fixtures.test-utils'
import { createTelemetryHistory } from '../telemetry-history'

describe('createTelemetryHistory', () => {
  it('downsamples to one sample per interval and ignores out-of-order telemetry', () => {
    const history = createTelemetryHistory(1000, 60_000)
    for (const t of [0, 200, 900, 1000, 1500, 400, 2100]) {
      history.record(telemetry('uav-01', t, { speed: t }))
    }
    expect(history.samples('uav-01').map((s) => s.timestamp)).toEqual([0, 1000, 2100])
  })

  it('keeps only the configured window of telemetry time', () => {
    const history = createTelemetryHistory(1000, 3000)
    for (let t = 0; t <= 10_000; t += 1000) history.record(telemetry('uav-01', t))
    expect(history.samples('uav-01').map((s) => s.timestamp)).toEqual([7000, 8000, 9000, 10_000])
  })

  it('maps trend fields and forgets UAVs that left the fleet', () => {
    const history = createTelemetryHistory()
    history.record(
      telemetry('uav-01', 0, {
        speed: 12,
        battery: 80,
        position: { latitude: 0, longitude: 0, altitude: 90 },
      }),
    )
    history.record(telemetry('uav-02', 0))
    expect(history.samples('uav-01')).toEqual([
      { timestamp: 0, altitude: 90, speed: 12, battery: 80 },
    ])

    history.retain(['uav-02'])
    expect(history.samples('uav-01')).toEqual([])
    expect(history.samples('uav-02')).toHaveLength(1)
  })
})

import type { UavTelemetry } from '@horizon/domain'
import { describe, expect, it } from 'vitest'
import { telemetry as sample } from '../fleet.fixtures.test-utils'
import { deriveUavStatus, healthIssues, OFFLINE_AFTER_MS, STALE_AFTER_MS } from '../fleet.status'

const telemetry = (overrides: Partial<UavTelemetry> = {}) => sample('uav-01', 0, overrides)

describe('deriveUavStatus', () => {
  const now = 100_000

  it('distinguishes standby and active by mission assignment', () => {
    expect(deriveUavStatus(telemetry(), now, now)).toBe('standby')
    expect(deriveUavStatus(telemetry({ missionId: 'm-1' }), now, now)).toBe('active')
  })

  it('flags health problems as warning', () => {
    expect(deriveUavStatus(telemetry({ battery: 19 }), now, now)).toBe('warning')
    expect(deriveUavStatus(telemetry({ signal: 20, missionId: 'm-1' }), now, now)).toBe('warning')
    expect(deriveUavStatus(telemetry({ gpsSatellites: 4 }), now, now)).toBe('warning')
  })

  it('goes stale, then offline, as telemetry ages', () => {
    const t = telemetry({ missionId: 'm-1' })
    expect(deriveUavStatus(t, now - STALE_AFTER_MS, now)).toBe('active')
    expect(deriveUavStatus(t, now - STALE_AFTER_MS - 1, now)).toBe('stale')
    expect(deriveUavStatus(t, now - OFFLINE_AFTER_MS - 1, now)).toBe('offline')
  })

  it('lets link freshness take precedence over health', () => {
    expect(deriveUavStatus(telemetry({ battery: 5 }), now - STALE_AFTER_MS - 1, now)).toBe('stale')
  })

  it('treats a UAV without telemetry as offline', () => {
    expect(deriveUavStatus(null, null, now)).toBe('offline')
  })
})

describe('healthIssues', () => {
  it('lists issues in severity order', () => {
    expect(healthIssues(telemetry({ battery: 10, signal: 10, gpsSatellites: 3 }))).toEqual([
      'low-battery',
      'weak-signal',
      'poor-gps',
    ])
    expect(healthIssues(telemetry())).toEqual([])
  })
})

import type { Uav, UavTelemetry } from '@horizon/domain'

export const uav = (id: string, overrides: Partial<Uav> = {}): Uav => ({
  id,
  name: id.toUpperCase(),
  model: 'Falcon X4',
  callsign: `HZN-${id}`,
  capabilities: { camera: true, thermalCamera: false },
  ...overrides,
})

export const telemetry = (
  uavId: string,
  timestamp: number,
  overrides: Partial<UavTelemetry> = {},
): UavTelemetry => ({
  uavId,
  timestamp,
  position: { latitude: 24.45, longitude: 54.39, altitude: 0 },
  speed: 0,
  heading: 0,
  battery: 90,
  signal: 95,
  gpsSatellites: 14,
  missionId: null,
  currentWaypoint: null,
  ...overrides,
})

import type { GeoPosition, MissionArea } from '@horizon/domain'

/** Fleet base: the center of the football stadium pitch east of the demo mission area. */
export const DEMO_BASE: GeoPosition = { latitude: 24.452756, longitude: 54.392171, altitude: 0 }

/**
 * Parking formation on the pitch (≈117 × 74 m): rows of `columns` UAVs run along the pitch's
 * long axis (bearing `axisBearing`), rows stack across it. Measured from Esri World Imagery.
 */
export const DEMO_PARKING = { axisBearing: 140.7, spacingMeters: 15, columns: 6 } as const

export const DEMO_FLEET_SIZE = 24

/** The prepared Area Scan mission used for manual start and demo autostart. */
export const DEMO_MISSION = {
  id: 'mission-demo-area-scan',
  name: 'Corniche Area Scan',
  altitude: 120,
  uavCount: 6,
  area: {
    polygon: [
      { latitude: 24.4625, longitude: 54.36 },
      { latitude: 24.472, longitude: 54.3615 },
      { latitude: 24.4735, longitude: 54.372 },
      { latitude: 24.466, longitude: 54.3745 },
      { latitude: 24.461, longitude: 54.369 },
    ],
  } satisfies MissionArea,
} as const

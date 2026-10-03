import type { Geofence, GeoPosition, MissionArea } from '@horizon/domain'

/** Fleet base: the center of the football stadium pitch east of the demo mission area. */
export const DEMO_BASE: GeoPosition = { latitude: 24.452756, longitude: 54.392171, altitude: 0 }

/**
 * Parking formation on the pitch (≈117 × 74 m): rows of `columns` UAVs run along the pitch's
 * long axis (bearing `axisBearing`), rows stack across it. Measured from Esri World Imagery.
 */
export const DEMO_PARKING = { axisBearing: 140.7, spacingMeters: 15, columns: 6 } as const

export const DEMO_FLEET_SIZE = 24

/** Large fleet for performance profiling; parked in a wider grid next to the pitch. */
export const STRESS_FLEET_SIZE = 480
export const STRESS_PARKING = { axisBearing: 140.7, spacingMeters: 8, columns: 24 } as const

export type DemoPreset = 'normal' | 'incident' | 'stress'

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

/**
 * Fixed no-fly zones around the demo site, placed clear of the demo mission, its transit from
 * the base and the default map view, so the prepared mission and a first drawn area stay
 * plannable.
 */
export const DEMO_GEOFENCES: Geofence[] = [
  {
    id: 'nfz-helipad',
    name: 'Hospital helipad',
    polygon: [
      { latitude: 24.441, longitude: 54.358 },
      { latitude: 24.446, longitude: 54.358 },
      { latitude: 24.446, longitude: 54.364 },
      { latitude: 24.441, longitude: 54.364 },
    ],
  },
  {
    id: 'nfz-palace',
    name: 'Palace grounds',
    polygon: [
      { latitude: 24.4765, longitude: 54.3635 },
      { latitude: 24.4805, longitude: 54.366 },
      { latitude: 24.4795, longitude: 54.3725 },
      { latitude: 24.476, longitude: 54.371 },
    ],
  },
  {
    id: 'nfz-marina',
    name: 'Marina',
    polygon: [
      { latitude: 24.4625, longitude: 54.3505 },
      { latitude: 24.4685, longitude: 54.3495 },
      { latitude: 24.469, longitude: 54.3555 },
      { latitude: 24.4635, longitude: 54.3565 },
    ],
  },
]

import type { GeoPosition, MissionArea } from '@horizon/domain'

/** Fleet base in Abu Dhabi. Parked UAVs are laid out on a grid starting here. */
export const DEMO_BASE: GeoPosition = { latitude: 24.453, longitude: 54.38, altitude: 0 }

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

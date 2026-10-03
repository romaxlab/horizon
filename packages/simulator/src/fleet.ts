import { destinationPoint, type GeoPosition, type Uav } from '@horizon/domain'
import type { Random } from './random'

const MODELS = ['Falcon X4', 'Kestrel M2', 'Heron VT'] as const
const PARKING_SPACING_METERS = 15
const PARKING_COLUMNS = 6

export interface GeneratedUav {
  uav: Uav
  home: GeoPosition
  battery: number
}

export function generateFleet(size: number, base: GeoPosition, random: Random): GeneratedUav[] {
  return Array.from({ length: size }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    const column = index % PARKING_COLUMNS
    const row = Math.floor(index / PARKING_COLUMNS)
    const east = destinationPoint(base, 90, column * PARKING_SPACING_METERS)
    const parked = destinationPoint(east, 180, row * PARKING_SPACING_METERS)

    return {
      uav: {
        id: `uav-${number}`,
        name: `UAV-${number}`,
        model: MODELS[index % MODELS.length] ?? MODELS[0],
        callsign: `HZN${number}`,
        capabilities: { camera: true, thermalCamera: index % 3 === 0 },
      },
      home: { ...parked, altitude: base.altitude },
      battery: Math.round(random.range(72, 100)),
    }
  })
}

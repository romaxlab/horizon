import { destinationPoint, type GeoPosition, type Uav } from '@horizon/domain'
import type { Random } from './random'

const MODELS = ['Falcon X4', 'Kestrel M2', 'Heron VT'] as const
export interface GeneratedUav {
  uav: Uav
  home: GeoPosition
  battery: number
}

export interface ParkingLayout {
  /** Bearing of the rows, degrees clockwise from north. */
  axisBearing: number
  spacingMeters: number
  columns: number
}

/** Point offset from `origin` by meters along `bearing` (negative values go the opposite way). */
function offset(origin: GeoPosition, bearing: number, meters: number): GeoPosition {
  const point = destinationPoint(origin, meters >= 0 ? bearing : bearing + 180, Math.abs(meters))
  return { ...point, altitude: origin.altitude }
}

/** UAVs park in a regular grid centered on the base and aligned with the parking axis. */
export function generateFleet(
  size: number,
  base: GeoPosition,
  parking: ParkingLayout,
  random: Random,
): GeneratedUav[] {
  const columns = Math.min(parking.columns, size)
  const rows = Math.ceil(size / columns)
  const across = parking.axisBearing + 90
  return Array.from({ length: size }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    const column = index % columns
    const row = Math.floor(index / columns)
    const alongRow = offset(
      base,
      parking.axisBearing,
      (column - (columns - 1) / 2) * parking.spacingMeters,
    )
    const parked = offset(alongRow, across, (row - (rows - 1) / 2) * parking.spacingMeters)

    return {
      uav: {
        id: `uav-${number}`,
        name: `UAV-${number}`,
        model: MODELS[index % MODELS.length] ?? MODELS[0],
        callsign: `HZN${number}`,
        capabilities: { camera: true, thermalCamera: index % 3 === 0 },
      },
      home: parked,
      battery: Math.round(random.range(72, 100)),
    }
  })
}

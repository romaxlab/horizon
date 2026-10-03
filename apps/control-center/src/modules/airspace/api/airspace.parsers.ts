import type { Geofence } from '@horizon/domain'
import { z } from 'zod'
import { geofencesDtoSchema } from './airspace.schema'

export class AirspacePayloadError extends Error {
  override name = 'AirspacePayloadError'
}

/** Validates and maps a geofence list payload. Throws on invalid data. */
export function parseGeofences(payload: unknown): Geofence[] {
  const result = geofencesDtoSchema.safeParse(payload)
  if (!result.success) {
    throw new AirspacePayloadError(`Invalid geofences: ${z.prettifyError(result.error)}`)
  }
  return result.data.map((zone) => ({
    id: zone.id,
    name: zone.name,
    polygon: zone.polygon.map((p) => ({ latitude: p.lat, longitude: p.lon })),
  }))
}

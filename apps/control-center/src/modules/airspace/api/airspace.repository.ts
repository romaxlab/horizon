import type { HttpClient } from '@/shared/http'
import type { AirspaceRepository } from '../model/airspace.types'
import { parseGeofences } from './airspace.parsers'

/** `GET /airspace/geofences` → validated no-fly zones. */
export function createRestAirspaceRepository(http: HttpClient): AirspaceRepository {
  return {
    async getGeofences(signal) {
      return parseGeofences(await http.get('airspace/geofences', { signal }))
    },
  }
}

import type { Geofence } from '@horizon/domain'

/** Source of restricted airspace. Mock and remote implementations share this contract. */
export interface AirspaceRepository {
  getGeofences(signal?: AbortSignal): Promise<Geofence[]>
}

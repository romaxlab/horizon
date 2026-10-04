import { defineServiceSlot } from '@/shared/lib/service-slot'
import type { Geofence } from '@horizon/domain'

/** Source of restricted airspace. Mock and remote implementations share this contract. */
export interface AirspaceRepository {
  getGeofences(signal?: AbortSignal): Promise<Geofence[]>
}

/** The AirspaceRepository implementation chosen at bootstrap (mock or remote). */
export const airspaceRepositorySlot = defineServiceSlot<AirspaceRepository>('AirspaceRepository')

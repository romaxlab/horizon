import type { Geofence } from '@horizon/domain'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { airspaceQueryKeys } from '../api/airspace.queries'
import { airspaceRepositorySlot } from './airspace.types'

const NONE: Geofence[] = []

/** No-fly zones. Static airspace data: loaded once, cached for the session, retried on failure. */
export function useGeofences() {
  const airspaceRepository = airspaceRepositorySlot.use()
  const query = useQuery({
    queryKey: airspaceQueryKeys.geofences,
    queryFn: ({ signal }) => airspaceRepository.getGeofences(signal),
    staleTime: Infinity,
  })
  return { geofences: computed(() => query.data.value ?? NONE) }
}

import type { HttpClient } from '@/shared/http'
import type { FleetRepository } from '../model/fleet.types'
import { parseFleetSnapshot } from './fleet.parsers'

/** `GET /fleet/snapshot` → validated, mapped fleet snapshot. */
export function createRestFleetRepository(http: HttpClient): FleetRepository {
  return {
    async getSnapshot(signal) {
      return parseFleetSnapshot(await http.get('fleet/snapshot', { signal }))
    },
  }
}

import { isPointInPolygon, type Geofence, type GeoPoint } from '@horizon/domain'
import { computed } from 'vue'
import { stableComputed } from '@/shared/lib/stable-computed'
import { useGeofences } from './useGeofences'

export interface FlyingUav {
  id: string
  position: GeoPoint
}

/**
 * Which flying UAV is inside which no-fly zone: computed once and shared by the map highlight
 * and incident detection. UAV positions come in from the caller (this module does not read the
 * fleet store).
 */
export function useAirspaceMonitor(flying: () => readonly FlyingUav[]) {
  const { geofences } = useGeofences()

  /** UAV id → the zone it is in, for UAVs inside one. */
  const breaches = computed(() => {
    const zones = geofences.value
    const inside = new Map<string, Geofence>()
    if (zones.length === 0) return inside
    for (const uav of flying()) {
      const zone = zones.find((z) => isPointInPolygon(uav.position, z.polygon))
      if (zone) inside.set(uav.id, zone)
    }
    return inside
  })

  /** Breached zone ids; stable so the map only redraws when the set changes. */
  const breachedZoneIds = stableComputed(
    () => [...new Set([...breaches.value.values()].map((zone) => zone.id))].sort(),
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  )

  return { geofences, breaches, breachedZoneIds }
}

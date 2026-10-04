import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { describe, expect, it } from 'vitest'
import { createApp, ref } from 'vue'
import { provideAppServices, type AppServices } from '@/app/providers/services'
import type { AirspaceRepository } from '../airspace.types'
import { useAirspaceMonitor, type FlyingUav } from '../useAirspaceMonitor'

const p = (latitude: number, longitude: number) => ({ latitude, longitude })
const zone = (id: string, lat: number) => ({
  id,
  name: id.toUpperCase(),
  polygon: [p(lat, 54), p(lat + 1, 54), p(lat + 1, 55), p(lat, 55)],
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('useAirspaceMonitor', () => {
  it('maps flying UAVs to the zone they are in, once for map and incidents', async () => {
    const airspaceRepository: AirspaceRepository = {
      getGeofences: () => Promise.resolve([zone('north', 10), zone('south', 0)]),
    }
    const app = createApp({})
    app.use(VueQueryPlugin, { queryClient: new QueryClient() })
    provideAppServices(app, { airspaceRepository } as unknown as AppServices)
    const flying = ref<FlyingUav[]>([
      { id: 'a', position: p(10.5, 54.5) },
      { id: 'b', position: p(5, 54.5) },
    ])
    const monitor = app.runWithContext(() => useAirspaceMonitor(() => flying.value))
    await flush()

    expect(monitor.breaches.value.get('a')?.name).toBe('NORTH')
    expect(monitor.breaches.value.has('b')).toBe(false)
    expect(monitor.breachedZoneIds.value).toEqual(['north'])

    flying.value = [...flying.value, { id: 'c', position: p(0.5, 54.5) }]
    expect(monitor.breachedZoneIds.value).toEqual(['north', 'south'])
  })
})

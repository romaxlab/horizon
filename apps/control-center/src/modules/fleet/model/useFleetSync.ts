import { useQueryClient } from '@tanstack/vue-query'
import { onBeforeUnmount, onMounted } from 'vue'
import { useAppServices } from '@/app/providers/services'
import { appConfig } from '@/shared/config'
import { fleetQueryKeys } from '../api/fleet.queries'
import { createFleetSync } from './fleet-sync'
import { useFleetStore } from './fleet.store'

/**
 * Keeps the fleet store in sync while the calling component is mounted:
 * snapshot query → hydrate Pinia ← realtime telemetry.
 */
export function useFleetSync({ onReconnected }: { onReconnected?: () => void } = {}) {
  const { fleetRepository, realtimeTransport } = useAppServices()
  const queryClient = useQueryClient()
  const store = useFleetStore()

  const sync = createFleetSync({
    transport: realtimeTransport,
    flushIntervalMs: appConfig.telemetryFlushMs,
    onReconnected,
    target: store,
    loadSnapshot: () =>
      queryClient.query({
        queryKey: fleetQueryKeys.snapshot,
        queryFn: ({ signal }) => fleetRepository.getSnapshot(signal),
        // The snapshot only seeds Pinia; it must not linger as a second source of truth.
        staleTime: 0,
        gcTime: 0,
      }),
  })

  onMounted(() => {
    void sync.start()
  })
  onBeforeUnmount(() => {
    sync.stop()
  })

  return { resync: () => sync.resync(), stats: () => sync.stats() }
}

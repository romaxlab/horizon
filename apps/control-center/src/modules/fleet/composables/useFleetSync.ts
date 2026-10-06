import { useQueryClient } from '@tanstack/vue-query'
import { onBeforeUnmount, onMounted } from 'vue'
import { realtimeTransportSlot } from '@/shared/realtime'
import { appConfig } from '@/shared/config'
import { documentVisibility } from '@/shared/lib/page-visibility'
import { fleetQueryKeys } from '../api/fleet.queries'
import { createFleetSync } from '../services/fleet-sync'
import { useFleetStore } from '../store/fleet.store'
import { fleetRepositorySlot } from '../model/fleet.types'

/**
 * Keeps the fleet store in sync while the calling component is mounted:
 * snapshot query → hydrate Pinia ← realtime telemetry.
 */
export function useFleetSync({ onReconnected }: { onReconnected?: () => void } = {}) {
  const fleetRepository = fleetRepositorySlot.use()
  const realtimeTransport = realtimeTransportSlot.use()
  const queryClient = useQueryClient()
  const store = useFleetStore()

  const sync = createFleetSync({
    transport: realtimeTransport,
    flushIntervalMs: appConfig.telemetryFlushMs,
    onReconnected,
    visibility: documentVisibility,
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

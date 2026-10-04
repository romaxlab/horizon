import { onBeforeUnmount, onMounted } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { realtimeTransportSlot } from '@/shared/realtime'
import { missionQueryKeys } from '../api/mission.queries'
import { parseMissionMessage } from '../api/mission.parsers'
import { useMissionStore } from './mission.store'
import { missionPlannerSlot } from './mission.types'

/**
 * Keeps the mission store current while mounted: loads the current mission, then applies
 * mission messages from the shared realtime transport (whose connection the fleet sync owns).
 */
export function useMissionSync() {
  const missionPlanner = missionPlannerSlot.use()
  const realtimeTransport = realtimeTransportSlot.use()
  const queryClient = useQueryClient()
  const store = useMissionStore()
  let unsubscribe: (() => void) | null = null
  let active = true

  /**
   * Loads the current mission through Query (retry, cancellation) like the fleet snapshot; the
   * result only seeds the store, which realtime mission messages keep current.
   */
  async function reload() {
    try {
      const mission = await queryClient.query({
        queryKey: missionQueryKeys.current,
        queryFn: ({ signal }) => missionPlanner.getActiveMission(signal),
        staleTime: 0,
        gcTime: 0,
      })
      if (active) store.replace(mission)
    } catch (error) {
      if (active) console.warn('[mission-sync] failed to load mission', error)
    }
  }

  onMounted(() => {
    unsubscribe = realtimeTransport.subscribe((event) => {
      if (event.type !== 'message') return
      const mission = parseMissionMessage(event.payload)
      if (mission) store.apply(mission)
    })
    void reload()
  })

  onBeforeUnmount(() => {
    active = false
    void queryClient.cancelQueries({ queryKey: missionQueryKeys.current })
    unsubscribe?.()
  })

  return { reload }
}

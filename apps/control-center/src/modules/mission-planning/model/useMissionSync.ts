import { onBeforeUnmount, onMounted } from 'vue'
import { useAppServices } from '@/app/providers/services'
import { parseMissionMessage } from '../api/mission.parsers'
import { useMissionStore } from './mission.store'

/**
 * Keeps the mission store current while mounted: loads the current mission, then applies
 * mission messages from the shared realtime transport (whose connection the fleet sync owns).
 */
export function useMissionSync() {
  const { missionPlanner, realtimeTransport } = useAppServices()
  const store = useMissionStore()
  let unsubscribe: (() => void) | null = null
  const controller = new AbortController()

  /** Loads the current mission; after a backend reset there may be none. */
  async function reload() {
    try {
      store.replace(await missionPlanner.getActiveMission(controller.signal))
    } catch (error) {
      if (!controller.signal.aborted) console.warn('[mission-sync] failed to load mission', error)
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
    controller.abort()
    unsubscribe?.()
  })

  return { reload }
}

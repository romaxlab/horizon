import type { Mission } from '@horizon/domain'
import { defineStore } from 'pinia'
import { ref } from 'vue'

const STATUS_ORDER: Record<Mission['status'], number> = {
  draft: 0,
  planned: 1,
  active: 2,
  completed: 3,
  aborted: 3,
}

/** Current mission (active or most recent), fed by the snapshot and realtime mission messages. */
export const useMissionStore = defineStore('mission', () => {
  const current = ref<Mission | null>(null)

  /** Applies a mission update; a stale update for the same mission never moves its status back. */
  function apply(mission: Mission | null) {
    const existing = current.value
    if (
      mission &&
      existing?.id === mission.id &&
      STATUS_ORDER[mission.status] < STATUS_ORDER[existing.status]
    ) {
      return
    }
    current.value = mission
  }

  return { current, apply }
})

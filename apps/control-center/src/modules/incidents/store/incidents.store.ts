import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Incident, NewIncident, Resolution } from '../model/incident.types'

const MAX_HISTORY = 100

/** Operational event history and the alerts that still need attention. */
export const useIncidentsStore = defineStore('incidents', () => {
  const history = ref<Incident[]>([])
  /** Events recorded since the history was last viewed. */
  const unreadCount = ref(0)
  const unreadAlertCount = ref(0)
  let seq = 0

  function record(incidents: NewIncident[], resolutions: Resolution[], timestamp: number) {
    if (resolutions.length > 0) {
      history.value = history.value.map((incident) =>
        !incident.resolved &&
        resolutions.some((r) => r.uavId === incident.uavId && r.types.includes(incident.type))
          ? { ...incident, resolved: true }
          : incident,
      )
    }
    if (incidents.length === 0) return
    const created = incidents.map((incident) => ({
      ...incident,
      id: `evt-${++seq}`,
      timestamp,
      resolved: false,
      acknowledged: false,
    }))
    history.value = [...created.reverse(), ...history.value].slice(0, MAX_HISTORY)
    unreadCount.value += created.length
    unreadAlertCount.value += created.filter((i) => i.severity !== 'info').length
  }

  function markSeen() {
    unreadCount.value = 0
    unreadAlertCount.value = 0
  }

  /** Unresolved, unacknowledged warning/critical events; critical first, newest first. */
  const alerts = computed(() =>
    history.value
      .filter((i) => i.severity !== 'info' && !i.resolved && !i.acknowledged)
      .sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical')),
  )

  function acknowledge(id: string) {
    history.value = history.value.map((i) => (i.id === id ? { ...i, acknowledged: true } : i))
  }

  function clear() {
    history.value = []
    markSeen()
  }

  return { history, alerts, unreadCount, unreadAlertCount, record, acknowledge, markSeen, clear }
})

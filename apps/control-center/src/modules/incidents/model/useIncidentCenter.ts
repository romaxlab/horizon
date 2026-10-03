import type { OperationalEventType } from '@horizon/domain'
import type { AlertVariant, BadgeVariant } from '@horizon/ui'
import { computed, watch, type Ref } from 'vue'
import { detectIncidents } from './detect-incidents'
import type { Incident, Observation } from './incident.types'
import { useIncidentsStore } from './incidents.store'

const titles: Record<OperationalEventType, string> = {
  MISSION_STARTED: 'Mission started',
  WAYPOINT_REACHED: 'Waypoint reached',
  MISSION_COMPLETED: 'Mission completed',
  MISSION_ABORTED: 'Mission stopped',
  LOW_BATTERY: 'Low battery',
  SIGNAL_DEGRADED: 'Signal degraded',
  TELEMETRY_STALE: 'Telemetry stale',
  CONNECTION_LOST: 'Connection lost',
  CONNECTION_RESTORED: 'Connection restored',
}

const alertVariant = (incident: Incident): AlertVariant =>
  incident.severity === 'critical' ? 'danger' : 'warning'

const feedVariant: Record<Incident['severity'], BadgeVariant> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
}

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const subjectOf = (incident: Incident) =>
  [incident.uavName, incident.detail].filter((part) => part !== null).join(' · ')

/** Max alerts shown at once; the rest are summarised. */
const VISIBLE_ALERTS = 3

/**
 * Turns observations of fleet, link and mission into operational events and alerts.
 * Inputs come from the route-level composition, so this module stays independent of fleet state.
 */
export function useIncidentCenter(
  observation: Readonly<Ref<Observation>>,
  now: () => number = Date.now,
) {
  const store = useIncidentsStore()
  let previous: Observation | null = null

  watch(
    observation,
    (next) => {
      const { incidents, resolutions } = detectIncidents(previous, next)
      previous = next
      store.record(incidents, resolutions, now())
    },
    { immediate: true },
  )

  const alerts = computed(() =>
    store.alerts.slice(0, VISIBLE_ALERTS).map((incident) => ({
      id: incident.id,
      uavId: incident.uavId,
      title: titles[incident.type],
      subject: subjectOf(incident),
      variant: alertVariant(incident),
    })),
  )
  const hiddenAlertCount = computed(() => Math.max(0, store.alerts.length - VISIBLE_ALERTS))

  const feed = computed(() =>
    store.history.map((incident) => ({
      id: incident.id,
      uavId: incident.uavId,
      time: timeFormat.format(incident.timestamp),
      title: titles[incident.type],
      subject: subjectOf(incident),
      variant: feedVariant[incident.severity],
      resolved: incident.resolved,
    })),
  )

  return {
    alerts,
    hiddenAlertCount,
    alertCount: computed(() => store.alerts.length),
    unreadCount: computed(() => store.unreadCount),
    unreadAlerts: computed(() => store.unreadAlertCount > 0),
    markSeen: store.markSeen,
    feed,
    acknowledge: store.acknowledge,
    clearHistory: store.clear,
  }
}

export type IncidentCenter = ReturnType<typeof useIncidentCenter>

import type { UavState, UavStatus } from '@horizon/domain'
import type { SegmentOption } from '@horizon/ui'
import { computed, ref, type Ref } from 'vue'
import { formatAge } from '@/shared/lib/format'
import { useNow } from '@/shared/lib/useNow'
import { uavStatusPresentation } from './fleet.presentation'
import { LOW_BATTERY_PCT } from './fleet.status'
import { useFleetStore } from './fleet.store'

export type FleetFilter = 'all' | 'active' | 'alerts' | 'standby'

const ALERT_STATUSES: ReadonlySet<UavStatus> = new Set(['warning', 'stale', 'offline'])

const matchesFilter: Record<FleetFilter, (status: UavStatus) => boolean> = {
  all: () => true,
  active: (status) => status === 'active',
  alerts: (status) => ALERT_STATUSES.has(status),
  standby: (status) => status === 'standby',
}

function matchesQuery({ uav }: UavState, query: string): boolean {
  if (!query) return true
  const haystack = `${uav.name} ${uav.callsign} ${uav.model}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term))
}

/** View model for the Fleet Panel: search, status filters and scan-friendly rows. */
export function useFleetPanel(now: Readonly<Ref<number>> = useNow()) {
  const store = useFleetStore()
  const query = ref('')
  const filter = ref<FleetFilter>('all')

  const filterOptions = computed<SegmentOption<FleetFilter>[]>(() => {
    const counts = store.statusCounts
    const alerts = counts.warning + counts.stale + counts.offline
    return [
      { value: 'all', label: `All ${store.uavs.length}` },
      { value: 'active', label: `Active ${counts.active}` },
      { value: 'alerts', label: `Alerts ${alerts}` },
      { value: 'standby', label: `Standby ${counts.standby}` },
    ]
  })

  const rows = computed(() =>
    store.uavs
      .filter(
        (state) =>
          matchesFilter[filter.value](state.status) && matchesQuery(state, query.value.trim()),
      )
      .map((state) => {
        const { uav, telemetry, status, lastUpdatedAt } = state
        const battery = telemetry ? Math.round(telemetry.battery) : null
        return {
          id: uav.id,
          name: uav.name,
          model: uav.model,
          status: uavStatusPresentation[status],
          battery: battery === null ? '—' : `${battery}%`,
          batteryLow: battery !== null && battery < LOW_BATTERY_PCT,
          // Only meaningful when the link is degraded; otherwise the row stays quiet.
          lastSeen:
            (status === 'stale' || status === 'offline') && lastUpdatedAt !== null
              ? formatAge(now.value - lastUpdatedAt)
              : null,
          selected: uav.id === store.selectedUavId,
        }
      }),
  )

  const isLoading = computed(
    () => store.uavs.length === 0 && store.connectionStatus === 'connecting',
  )

  return { query, filter, filterOptions, rows, isLoading }
}

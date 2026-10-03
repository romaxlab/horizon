import type { UavState, UavStatus } from '@horizon/domain'
import type { BadgeVariant, SegmentOption } from '@horizon/ui'
import { computed, ref, type Ref } from 'vue'
import { formatAge } from '@/shared/lib/format'
import { stableComputed } from '@/shared/lib/stable-computed'
import { useNow } from '@/shared/lib/useNow'
import { uavStatusPresentation } from './fleet.presentation'
import { LOW_BATTERY_PCT } from './fleet.status'
import { useFleetStore } from './fleet.store'

export interface FleetRow {
  id: string
  name: string
  model: string
  status: { label: string; variant: BadgeVariant }
  battery: string
  batteryLow: boolean
  lastSeen: string | null
  selected: boolean
}

const sameItems = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, i) => item === b[i])

const sameLabels = (a: readonly SegmentOption[], b: readonly SegmentOption[]) =>
  a.length === b.length && a.every((option, i) => option.label === b[i]?.label)

const sameRow = (a: FleetRow, b: FleetRow) =>
  a.name === b.name &&
  a.model === b.model &&
  a.status === b.status &&
  a.battery === b.battery &&
  a.batteryLow === b.batteryLow &&
  a.lastSeen === b.lastSeen &&
  a.selected === b.selected

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

  const filterOptions = stableComputed<SegmentOption<FleetFilter>[]>(() => {
    const counts = store.statusCounts
    const alerts = counts.warning + counts.stale + counts.offline
    return [
      { value: 'all', label: `All ${store.uavs.length}` },
      { value: 'active', label: `Active ${counts.active}` },
      { value: 'alerts', label: `Alerts ${alerts}` },
      { value: 'standby', label: `Standby ${counts.standby}` },
    ]
  }, sameLabels)

  /**
   * Rows keep their identity while their visible values are unchanged, so a telemetry flush only
   * re-renders the rows that actually changed (not the whole list of up to hundreds of UAVs).
   */
  const rowCache = new Map<string, FleetRow>()

  // The list itself also stays the same array while no row changed.
  const rows = stableComputed(
    () =>
      store.uavs
        .filter(
          (state) =>
            matchesFilter[filter.value](state.status) && matchesQuery(state, query.value.trim()),
        )
        .map((state) => {
          const { uav, telemetry, status, lastUpdatedAt } = state
          const battery = telemetry ? Math.round(telemetry.battery) : null
          const next: FleetRow = {
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
          const previous = rowCache.get(uav.id)
          if (previous && sameRow(previous, next)) return previous
          rowCache.set(uav.id, next)
          return next
        }),
    sameItems,
  )

  const isLoading = computed(
    () => store.uavs.length === 0 && store.connectionStatus === 'connecting',
  )

  return { query, filter, filterOptions, rows, isLoading }
}

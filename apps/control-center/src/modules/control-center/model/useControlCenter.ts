import type { BadgeVariant } from '@horizon/ui'
import { computed } from 'vue'
import { useFleetStore, useFleetSync, type ConnectionStatus } from '@/modules/fleet'
import { useMapStore } from '@/modules/map'
import { computeMissionProgress, useMissionStore, useMissionSync } from '@/modules/mission-planning'
import { formatDuration } from '@/shared/lib/format'
import { useNow } from '@/shared/lib/useNow'

const connectionPresentation: Record<ConnectionStatus, { label: string; variant: BadgeVariant }> = {
  connecting: { label: 'Connecting', variant: 'neutral' },
  live: { label: 'Live', variant: 'success' },
  offline: { label: 'Offline', variant: 'danger' },
}

const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZoneName: 'short',
})

/** Route-level composition for the Control Center: starts live sync and coordinates modules. */
export function useControlCenter() {
  useFleetSync()
  const fleet = useFleetStore()
  const map = useMapStore()
  const now = useNow()

  const connection = computed(() => connectionPresentation[fleet.connectionStatus])
  const clock = computed(() => clockFormat.format(now.value))

  useMissionSync()
  const missions = useMissionStore()

  const missionProgress = computed(() => {
    const current = missions.current
    if (!current) return null
    const telemetry = new Map(
      fleet.uavs.flatMap((s) => (s.telemetry ? [[s.uav.id, s.telemetry] as const] : [])),
    )
    return computeMissionProgress(current, telemetry)
  })

  const mission = computed(() => {
    const current = missions.current
    const progress = missionProgress.value
    if (!current || !progress || current.status !== 'active') {
      return {
        title:
          current?.status === 'completed' ? `${current.name} · completed` : 'No active mission',
        state: 'Standing by',
        detail: `${fleet.statusCounts.standby} UAVs ready`,
      }
    }
    const eta = progress.etaSec === null ? '' : ` · ETA ${formatDuration(progress.etaSec)}`
    return {
      title: current.name,
      state: `${Math.round(progress.ratio * 100)}%`,
      detail: `${progress.activeUavCount} UAVs scanning${eta}`,
    }
  })

  /**
   * One shared selection for list, map and inspector. Selecting from the list also flies the map
   * to the UAV; selecting on the map keeps the camera. Follow moves to the new selection or stops.
   */
  function selectUav(uavId: string | null, options: { focus?: boolean } = {}) {
    fleet.selectUav(uavId)
    if (map.followUavId !== null) map.setFollow(fleet.selectedUavId)
    if (options.focus && fleet.selectedUavId) map.focusUav(fleet.selectedUavId)
  }

  function focusSelected() {
    if (fleet.selectedUavId) map.focusUav(fleet.selectedUavId)
  }

  function toggleFollow() {
    map.setFollow(map.followUavId === null ? fleet.selectedUavId : null)
  }

  return {
    connection,
    clock,
    mission,
    uavs: computed(() => fleet.uavs),
    selectedUavId: computed(() => fleet.selectedUavId),
    inspectorOpen: computed(() => fleet.selectedUav !== null),
    following: computed(() => map.followUavId !== null),
    selectUav,
    focusSelected,
    toggleFollow,
  }
}

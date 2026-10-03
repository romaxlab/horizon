import { computed } from 'vue'
import { uavStatusPresentation } from './fleet.presentation'
import { useFleetStore } from './fleet.store'

export function useFleetPanel() {
  const store = useFleetStore()

  const rows = computed(() =>
    store.uavs.map(({ uav, telemetry, status }) => ({
      id: uav.id,
      name: uav.name,
      model: uav.model,
      status: uavStatusPresentation[status],
      battery: telemetry ? `${Math.round(telemetry.battery)}%` : '—',
    })),
  )

  const summary = computed(() => {
    const active = store.uavs.filter((s) => s.status === 'active').length
    return { total: store.uavs.length, active, standby: store.uavs.length - active }
  })

  const isLoading = computed(
    () => store.uavs.length === 0 && store.connectionStatus === 'connecting',
  )

  return { rows, summary, isLoading }
}

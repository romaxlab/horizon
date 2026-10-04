import { useFleetStore } from '@/modules/fleet'
import { useMapStore } from '@/modules/map'
import { useStartupSequence } from './useStartupSequence'

/** The startup sequence wired to the app's real readiness signals. */
export function useStartup() {
  const fleet = useFleetStore()
  const map = useMapStore()
  return useStartupSequence({
    status: {
      app: () => true,
      telemetry: () => fleet.connectionStatus === 'live',
      fleet: () => fleet.uavs.length > 0,
    },
    mapReady: () => map.sceneReady,
  })
}

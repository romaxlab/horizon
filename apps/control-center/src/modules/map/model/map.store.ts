import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Basemap imagery: muted gray map or satellite. */
export type MapBasemap = 'map' | 'satellite'
/** `2d` looks straight down; `3d` tilts the camera (3D buildings with a Cesium ion token). */
export type MapPerspective = '2d' | '3d'

/**
 * Camera and view intents shared between the map and other modules. The map executes them; it
 * never owns selection or other domain state.
 */
export const useMapStore = defineStore('map', () => {
  const followUavId = ref<string | null>(null)
  /** Monotonic request counters let the map react to repeated identical requests. */
  const focusRequest = ref<{ uavId: string; seq: number } | null>(null)
  const homeRequest = ref(0)
  const basemap = ref<MapBasemap>('map')
  const perspective = ref<MapPerspective>('2d')

  function focusUav(uavId: string) {
    focusRequest.value = { uavId, seq: (focusRequest.value?.seq ?? 0) + 1 }
  }

  function setFollow(uavId: string | null) {
    followUavId.value = uavId
  }

  function resetView() {
    followUavId.value = null
    homeRequest.value += 1
  }

  function setBasemap(next: MapBasemap) {
    basemap.value = next
  }

  function setPerspective(next: MapPerspective) {
    perspective.value = next
  }

  return {
    followUavId,
    focusRequest,
    homeRequest,
    basemap,
    perspective,
    focusUav,
    setFollow,
    resetView,
    setBasemap,
    setPerspective,
  }
})

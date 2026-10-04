import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

/** Screen space covered by floating panels, CSS px from each map edge. */
export interface ViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

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
  /** Reported by the layout; the camera centers things in the area the panels leave free. */
  const viewportInsets = shallowRef<ViewportInsets>({ top: 0, right: 0, bottom: 0, left: 0 })

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

  function setViewportInsets(next: ViewportInsets) {
    const current = viewportInsets.value
    if (
      current.top === next.top &&
      current.right === next.right &&
      current.bottom === next.bottom &&
      current.left === next.left
    )
      return
    viewportInsets.value = next
  }

  return {
    followUavId,
    focusRequest,
    homeRequest,
    basemap,
    perspective,
    viewportInsets,
    focusUav,
    setFollow,
    resetView,
    setBasemap,
    setPerspective,
    setViewportInsets,
  }
})

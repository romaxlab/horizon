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
 * Opening camera arrival (used by a startup sequence): `held` keeps the camera high above the
 * operating area with map content hidden, `flying` flies down to the home view, `settled` is the
 * normal map. The map starts settled unless something holds it before the scene is created.
 */
export type MapArrival =
  | { stage: 'held' }
  | { stage: 'flying'; durationMs: number }
  /** `cut`: the arrival was ended early; the camera jumps to the home view. */
  | { stage: 'settled'; cut: boolean }

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
  const arrival = shallowRef<MapArrival>({ stage: 'settled', cut: false })
  /** Map content (UAVs, overlays) hidden during the arrival until revealed. */
  const contentHidden = ref(false)
  /** The 3D scene exists and can take camera requests (Cesium loads on demand). */
  const sceneReady = ref(false)

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

  /** Holds the camera in orbit with content hidden; call before the map is created. */
  function holdArrival() {
    arrival.value = { stage: 'held' }
    contentHidden.value = true
  }

  function flyIn(durationMs: number) {
    arrival.value = { stage: 'flying', durationMs }
  }

  /**
   * Ends the arrival. `cut` (e.g. skipped) jumps to the home view, cutting a flight short;
   * otherwise the camera stays where it is (the flight has landed, the user may already pan).
   */
  function settleArrival(cut = false) {
    if (arrival.value.stage !== 'settled') arrival.value = { stage: 'settled', cut }
  }

  function revealContent() {
    contentHidden.value = false
  }

  function setSceneReady(ready: boolean) {
    sceneReady.value = ready
  }

  return {
    followUavId,
    focusRequest,
    homeRequest,
    basemap,
    perspective,
    viewportInsets,
    arrival,
    contentHidden,
    sceneReady,
    focusUav,
    setFollow,
    resetView,
    setBasemap,
    setPerspective,
    setViewportInsets,
    holdArrival,
    flyIn,
    settleArrival,
    revealContent,
    setSceneReady,
  }
})

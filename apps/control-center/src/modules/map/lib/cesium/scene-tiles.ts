import type { Scene } from 'cesium'

/** Don't wait forever for tiles (slow network); go on with whatever has loaded by then. */
const TILE_WAIT_MS = 3_000

/** Calls back once the globe's visible tiles have loaded (or after a timeout). */
export function afterTilesLoaded(scene: Scene, callback: () => void) {
  const startedAt = performance.now()
  let frames = 0
  const remove = scene.postRender.addEventListener(() => {
    scene.requestRender()
    frames += 1
    const loaded = frames > 2 && scene.globe.tilesLoaded
    if (loaded || performance.now() - startedAt > TILE_WAIT_MS) {
      remove()
      callback()
    }
  })
}

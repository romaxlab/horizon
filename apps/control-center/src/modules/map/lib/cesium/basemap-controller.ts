import {
  ImageryLayer,
  IonWorldImageryStyle,
  UrlTemplateImageryProvider,
  createWorldImageryAsync,
  type Scene,
} from 'cesium'
import type { MapBasemap } from '../../model/map.store'
import { afterTilesLoaded } from './scene-tiles'

export type MapTheme = 'light' | 'dark'

/** Tile source; its attribution is shown by the UI (see `basemap-credits.ts`). */
interface BasemapSource {
  url: string
  maximumLevel: number
}

/**
 * Keyless Esri basemaps. Free for development and demos with attribution; production use
 * requires an ArcGIS account or another provider. With an ion token, Satellite uses Cesium ion
 * imagery instead (see `createBasemap`); the dark/light canvas stays Esri, which ion lacks.
 */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const BASEMAPS = {
  // Muted gray canvas that keeps the map calm under glass panels; follows the theme.
  light: {
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    maximumLevel: 16,
  },
  dark: {
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    maximumLevel: 16,
  },
  satellite: {
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    maximumLevel: 19,
  },
} satisfies Record<MapTheme | 'satellite', BasemapSource>

/** Basemaps cross-fade once the incoming tiles are ready, so switching never flashes. */
const BASEMAP_FADE_MS = 250

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function createUrlBasemap(source: BasemapSource): ImageryLayer {
  return new ImageryLayer(
    new UrlTemplateImageryProvider({
      url: source.url,
      maximumLevel: source.maximumLevel,
    }),
  )
}

/**
 * The imagery under the map: Esri canvas (follows the theme) or satellite — from Cesium ion
 * while ion imagery works, Esri otherwise. Switching cross-fades without a flash.
 */
export function createBasemapController(
  scene: Scene,
  options: {
    theme: MapTheme
    basemap: MapBasemap
    ionToken: string | null
    /** Ion satellite imagery failed (e.g. invalid token); Satellite falls back to Esri. */
    onIonImageryUnavailable?: () => void
  },
) {
  let { theme, basemap } = options
  const { onIonImageryUnavailable } = options
  /** Satellite from Cesium ion (Bing Maps Aerial) while ion imagery works; Esri otherwise. */
  let ionImagery = options.ionToken !== null

  function createBasemap(): ImageryLayer {
    if (basemap !== 'satellite' || !ionImagery) {
      return createUrlBasemap(BASEMAPS[basemap === 'map' ? theme : 'satellite'])
    }
    const layer = ImageryLayer.fromProviderAsync(
      createWorldImageryAsync({ style: IonWorldImageryStyle.AERIAL }),
    )
    layer.errorEvent.addEventListener((error: unknown) => {
      if (!ionImagery) return
      console.warn('[map] Cesium ion imagery unavailable; using Esri', error)
      ionImagery = false
      onIonImageryUnavailable?.()
      // Swap in Esri satellite through the normal cross-fade; it drops the failed layer.
      if (basemap === 'satellite') replaceBasemap()
    })
    return layer
  }

  /** Increments per basemap change; a newer change supersedes an in-flight cross-fade. */
  let basemapTransition = 0

  /** Adds the new basemap on top, waits for its tiles, fades it in, then drops older layers. */
  function replaceBasemap() {
    const transition = ++basemapTransition
    const layers = scene.imageryLayers
    const next = createBasemap()
    next.alpha = 0
    layers.add(next)

    // An ion layer has no tiles to wait for until its provider is ready.
    const whenReady = (callback: () => void) => {
      if (next.ready) {
        callback()
        return
      }
      const remove = next.readyEvent.addEventListener(() => {
        remove()
        callback()
      })
    }
    whenReady(() => {
      afterTilesLoaded(scene, () => {
        if (transition !== basemapTransition) return
        const fadeMs = reducedMotion() ? 0 : BASEMAP_FADE_MS
        const fadeStart = performance.now()
        const removeFade = scene.preRender.addEventListener(() => {
          scene.requestRender()
          const progress = fadeMs === 0 ? 1 : Math.min(1, (performance.now() - fadeStart) / fadeMs)
          next.alpha = progress
          if (progress < 1) return
          removeFade()
          if (transition !== basemapTransition) return
          for (let i = layers.length - 1; i >= 0; i--) {
            const layerAt = layers.get(i)
            if (layerAt !== next) layers.remove(layerAt, true)
          }
        })
      })
    })
  }

  scene.imageryLayers.add(createBasemap())

  return {
    setTheme(next: MapTheme) {
      theme = next
      if (basemap === 'map') replaceBasemap()
    },
    setBasemap(next: MapBasemap) {
      basemap = next
      replaceBasemap()
    },
    /** Drops any cross-fade in flight. */
    destroy() {
      basemapTransition += 1
    },
  }
}

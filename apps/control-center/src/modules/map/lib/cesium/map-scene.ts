import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { GeoPoint, UavState } from '@horizon/domain'
import {
  Cartographic,
  Credit,
  ImageryLayer,
  Ion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  Viewer,
  createGooglePhotorealistic3DTileset,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  defined,
  sampleTerrainMostDetailed,
  type Cartesian2,
  type Cesium3DTileset,
} from 'cesium'
import type { MapBasemap, MapPerspective } from '../../model/map.store'
import { createCameraController, OPERATING_SITE } from './camera-controller'
import { createClusterLayer } from './cluster-layer'
import { createGeofenceLayer, type GeofenceOverlay } from './geofence-layer'
import { createMissionLayer, type MissionOverlay } from './mission-layer'
import { readMapPalette } from './palette'
import { createUavLayer } from './uav-layer'

export type MapTheme = 'light' | 'dark'

type ContentSource = 'google-photorealistic' | 'terrain-osm-buildings'

interface BasemapSource {
  url: string
  maximumLevel: number
  credit: string
}

/**
 * Keyless Esri basemaps. Free for development and demos with attribution; production use
 * requires an ArcGIS account or another provider.
 */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const CANVAS_CREDIT = 'Esri, HERE, Garmin, © OpenStreetMap contributors'
const BASEMAPS = {
  // Muted gray canvas that keeps the map calm under glass panels; follows the theme.
  light: {
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    maximumLevel: 16,
    credit: CANVAS_CREDIT,
  },
  dark: {
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    maximumLevel: 16,
    credit: CANVAS_CREDIT,
  },
  satellite: {
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    maximumLevel: 19,
    credit: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
} satisfies Record<MapTheme | 'satellite', BasemapSource>

/** Sharper tiles in tilted views than Cesium's default (2). */
const MAXIMUM_SCREEN_SPACE_ERROR = 1.5
/** Cap the render resolution to keep 4K/5K displays smooth. */
const MAX_PIXEL_RATIO = 2
/** Basemaps cross-fade once the incoming tiles are ready, so switching never flashes. */
const BASEMAP_FADE_MS = 250
/** Don't wait forever for tiles (slow network); fade in whatever has loaded by then. */
const TILE_WAIT_MS = 3_000

export interface MapSceneOptions {
  container: HTMLElement
  creditContainer: HTMLElement
  theme: MapTheme
  basemap: MapBasemap
  perspective: MapPerspective
  /** Adds 3D buildings to the 3D perspective; without it 3D is a keyless tilted view. */
  ionToken: string | null
  onSelect: (uavId: string | null) => void
  /** Ground point clicked while drawing mode is on. */
  onDraw: (point: GeoPoint) => void
  /** The camera stopped following on its own (e.g. zooming into a cluster). */
  onFollowStopped: () => void
}

/** Public surface of the 3D map, independent of Vue. */
export interface MapScene {
  sync(states: readonly UavState[]): void
  update(changed: readonly UavState[]): void
  select(uavId: string | null): void
  setTheme(theme: MapTheme): void
  setBasemap(basemap: MapBasemap): void
  setPerspective(perspective: MapPerspective): void
  setMissionOverlay(overlay: MissionOverlay | null): void
  setGeofences(zones: readonly GeofenceOverlay[]): void
  /** While drawing, clicks add area points instead of selecting UAVs. */
  setDrawing(drawing: boolean): void
  home(): void
  focusUav(uavId: string): void
  follow(uavId: string | null): void
  destroy(): void
}

function createBasemap(source: BasemapSource): ImageryLayer {
  return new ImageryLayer(
    new UrlTemplateImageryProvider({
      url: source.url,
      maximumLevel: source.maximumLevel,
      credit: new Credit(source.credit, true),
    }),
  )
}

export function createMapScene({
  container,
  creditContainer,
  theme: initialTheme,
  basemap: initialBasemap,
  perspective: initialPerspective,
  ionToken,
  onSelect,
  onDraw,
  onFollowStopped,
}: MapSceneOptions): MapScene {
  if (ionToken) Ion.defaultAccessToken = ionToken

  let theme = initialTheme
  let basemap = initialBasemap
  let perspective = initialPerspective
  const basemapSource = () => BASEMAPS[basemap === 'map' ? theme : 'satellite']

  const viewer = new Viewer(container, {
    baseLayer: createBasemap(basemapSource()),
    creditContainer,
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    skyBox: false,
    shouldAnimate: true,
    // Render on demand: an idle scene (nothing moving) stops redrawing at 60 fps. Camera input,
    // tile loading and flights still render automatically; motion keeps frames coming below.
    requestRenderMode: true,
    maximumRenderTimeChange: Number.POSITIVE_INFINITY,
  })

  const { scene } = viewer
  let palette = readMapPalette()

  // Render at device resolution (Retina) instead of CSS pixels, capped for very dense displays.
  viewer.useBrowserRecommendedResolution = false
  viewer.resolutionScale = Math.min(1, MAX_PIXEL_RATIO / window.devicePixelRatio)
  scene.globe.maximumScreenSpaceError = MAXIMUM_SCREEN_SPACE_ERROR
  scene.postProcessStages.fxaa.enabled = true

  function applySceneColors() {
    scene.backgroundColor = palette.canvas
    scene.globe.baseColor = palette.canvas
  }
  scene.globe.showGroundAtmosphere = false
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false
  if (scene.sun) scene.sun.show = false
  if (scene.moon) scene.moon.show = false
  scene.screenSpaceCameraController.maximumZoomDistance = 60_000
  applySceneColors()

  const layer = createUavLayer(viewer, palette)
  const clusters = createClusterLayer(viewer, layer, palette)
  const missionLayer = createMissionLayer(viewer, palette)
  const geofenceLayer = createGeofenceLayer(viewer, palette)
  let drawing = false

  function setGroundHeight(meters: number) {
    layer.setGroundHeight(meters)
    missionLayer.setGroundHeight(meters)
  }
  const camera = createCameraController(viewer, layer, perspective === '3d', onFollowStopped)
  camera.home(false)

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /** Calls back once the globe's visible tiles have loaded (or after a timeout). */
  function afterTilesLoaded(callback: () => void) {
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

  /** Increments per basemap change; a newer change supersedes an in-flight cross-fade. */
  let basemapTransition = 0

  /** Adds the new basemap on top, waits for its tiles, fades it in, then drops older layers. */
  function replaceBasemap() {
    const transition = ++basemapTransition
    const layers = scene.imageryLayers
    const next = createBasemap(basemapSource())
    next.alpha = 0
    layers.add(next)

    afterTilesLoaded(() => {
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
  }

  // --- 3D content ----------------------------------------------------------------------------

  type ContentKind = 'photorealistic' | 'buildings'

  /** 3D content shown in the 3D perspective (Google tiles or OSM buildings). */
  let content3d: { tileset: Cesium3DTileset; source: ContentSource } | null = null
  /** What the current basemap + perspective ask for; null means no 3D content. */
  let wantedContent: ContentKind | null = null
  /** Ground height of the loaded World Terrain at the operating site (0 on the ellipsoid). */
  let terrainGroundHeight = 0
  let terrainLoaded = false
  /** Incremented on every content change so slow loads from a previous request are discarded. */
  let contentRequest = 0

  const site = () => Cartographic.fromDegrees(OPERATING_SITE.longitude, OPERATING_SITE.latitude)

  async function sampleTilesetGround(): Promise<number | null> {
    try {
      const [sample] = await scene.sampleHeightMostDetailed([site()])
      return sample?.height ?? null
    } catch {
      return null
    }
  }

  /** Terrain stays loaded once used so later switches don't rebuild the globe. */
  async function ensureTerrain() {
    if (terrainLoaded) return
    viewer.terrainProvider = await createWorldTerrainAsync()
    terrainLoaded = true
    try {
      const [sample] = await sampleTerrainMostDetailed(viewer.terrainProvider, [site()])
      terrainGroundHeight = sample?.height ?? 0
    } catch {
      terrainGroundHeight = 0
    }
  }

  /** Removes 3D content: the globe comes back first; content goes once the globe is ready. */
  function clearContent() {
    const previous = content3d
    content3d = null
    scene.globe.show = true
    setGroundHeight(terrainGroundHeight)
    if (previous) {
      afterTilesLoaded(() => {
        if (content3d?.tileset !== previous.tileset) scene.primitives.remove(previous.tileset)
      })
    }
  }

  function showContent(tileset: Cesium3DTileset, source: ContentSource, request: number) {
    const previous = content3d
    content3d = { tileset, source }
    scene.primitives.add(tileset)
    if (previous) scene.primitives.remove(previous.tileset)
    if (source !== 'google-photorealistic') return
    // Photorealistic tiles include the ground; hide the globe only once they are visible.
    const remove = tileset.initialTilesLoaded.addEventListener(() => {
      remove()
      if (request === contentRequest && content3d?.tileset === tileset) scene.globe.show = false
    })
  }

  /** Cesium World Terrain + Cesium OSM Buildings. */
  async function loadBuildings(): Promise<Cesium3DTileset> {
    const [buildings] = await Promise.all([createOsmBuildingsAsync(), ensureTerrain()])
    return buildings
  }

  /**
   * Photorealistic: Google Photorealistic 3D Tiles via Cesium ion (no Google key or billing),
   * falling back to terrain + OSM buildings when the asset isn't available to the account.
   */
  async function loadContent(kind: ContentKind, request: number) {
    const isStale = () => request !== contentRequest
    let source: ContentSource = 'terrain-osm-buildings'
    let tileset: Cesium3DTileset
    try {
      if (kind === 'photorealistic') {
        try {
          // No geocoder is used anywhere, which satisfies Google's "Google geocoder only" terms.
          tileset = await createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true })
          source = 'google-photorealistic'
        } catch (error) {
          console.warn('[map] Google Photorealistic 3D Tiles unavailable; using OSM', error)
          tileset = await loadBuildings()
        }
      } else {
        tileset = await loadBuildings()
      }
    } catch (error) {
      console.warn('[map] 3D buildings unavailable', error)
      return
    }

    if (isStale()) {
      tileset.destroy()
      return
    }
    showContent(tileset, source, request)

    const ground = source === 'google-photorealistic' ? await sampleTilesetGround() : null
    if (!isStale()) setGroundHeight(ground ?? terrainGroundHeight)
  }

  /**
   * 3D content follows basemap + perspective: in 3D with an ion token, Satellite shows
   * photorealistic tiles and Map shows calm OSM buildings on terrain. Otherwise none.
   */
  function updateContent() {
    const wanted: ContentKind | null =
      perspective === '3d' && ionToken
        ? basemap === 'satellite'
          ? 'photorealistic'
          : 'buildings'
        : null
    if (wanted === wantedContent) return
    wantedContent = wanted
    const request = ++contentRequest
    if (wanted) void loadContent(wanted, request)
    else clearContent()
  }

  updateContent()

  // --- Picking -------------------------------------------------------------------------------

  // Selection is owned by the application; the map only reports picks.
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
    ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
  )
  const handler = new ScreenSpaceEventHandler(scene.canvas)
  type PickTarget = { kind: 'uav'; uavId: string } | { kind: 'cluster'; members: string[] }
  const pick = (position: Cartesian2): PickTarget | null => {
    const picked: unknown = scene.pick(position)
    if (!defined(picked)) return null
    const uavId = layer.uavIdFromPick(picked)
    if (uavId) return { kind: 'uav', uavId }
    const members = clusters.membersFromPick(picked)
    return members ? { kind: 'cluster', members } : null
  }
  handler.setInputAction((event: { position: Cartesian2 }) => {
    if (drawing) {
      const ground = camera.groundPointAt(event.position)
      if (ground) onDraw(ground)
      return
    }
    const target = pick(event.position)
    if (target?.kind === 'cluster') {
      // Clicking a cluster zooms in until its UAVs separate; selection is unchanged.
      const sphere = clusters.boundingSphereOf(target.members)
      if (sphere) camera.focusArea(sphere)
      return
    }
    onSelect(target?.uavId ?? null)
  }, ScreenSpaceEventType.LEFT_CLICK)
  let lastHovered: string | null = null
  handler.setInputAction((event: { endPosition: Cartesian2 }) => {
    if (drawing) {
      scene.canvas.style.cursor = 'crosshair'
      return
    }
    const target = pick(event.endPosition)
    scene.canvas.style.cursor = target ? 'pointer' : ''
    const hovered = target?.kind === 'uav' ? target.uavId : null
    if (hovered !== lastHovered) {
      lastHovered = hovered
      layer.setHovered(hovered)
      scene.requestRender()
    }
  }, ScreenSpaceEventType.MOUSE_MOVE)

  // While any UAV moves (interpolated), keep Cesium's own render loop producing frames.
  const removeAnimationLoop = scene.postRender.addEventListener(() => {
    if (layer.isAnimating()) scene.requestRender()
  })

  /** Any app-driven change (fleet, selection, theme, overlays) needs a frame in on-demand mode. */
  const withRender =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      fn(...args)
      scene.requestRender()
    }

  return {
    sync: withRender((states: readonly UavState[]) => {
      layer.sync(states)
    }),
    update: withRender((changed: readonly UavState[]) => {
      layer.update(changed)
    }),
    select: withRender((uavId: string | null) => {
      layer.select(uavId)
    }),
    setTheme: withRender((next: MapTheme) => {
      theme = next
      palette = readMapPalette()
      applySceneColors()
      layer.setPalette(palette)
      clusters.setPalette(palette)
      missionLayer.setPalette(palette)
      geofenceLayer.setPalette(palette)
      if (basemap === 'map') replaceBasemap()
    }),
    setBasemap: withRender((next: MapBasemap) => {
      if (next === basemap) return
      basemap = next
      replaceBasemap()
      updateContent()
    }),
    setPerspective: withRender((next: MapPerspective) => {
      if (next === perspective) return
      perspective = next
      camera.setTilted(perspective === '3d')
      updateContent()
    }),
    // Camera flights render on their own (camera changes trigger frames).
    home: () => {
      camera.home(true)
    },
    focusUav: (uavId) => {
      camera.focusUav(uavId)
    },
    follow: withRender((uavId: string | null) => {
      camera.follow(uavId)
    }),
    setMissionOverlay: withRender((overlay: MissionOverlay | null) => {
      missionLayer.set(overlay)
    }),
    setGeofences: withRender((zones: readonly GeofenceOverlay[]) => {
      geofenceLayer.set(zones)
    }),
    setDrawing: withRender((next: boolean) => {
      drawing = next
      scene.canvas.style.cursor = next ? 'crosshair' : ''
      if (next) layer.setHovered(null)
    }),
    destroy() {
      removeAnimationLoop()
      contentRequest += 1
      basemapTransition += 1
      handler.destroy()
      clusters.destroy()
      missionLayer.destroy()
      geofenceLayer.destroy()
      layer.destroy()
      viewer.destroy()
    },
  }
}

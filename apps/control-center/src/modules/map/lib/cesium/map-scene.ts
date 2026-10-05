import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { GeoPoint, UavState } from '@horizon/domain'
import {
  Cartesian2,
  Cartesian3,
  DirectionalLight,
  Matrix4,
  Transforms,
  Ion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  defined,
} from 'cesium'
import type { MapBasemap, MapPerspective, ViewportInsets } from '../../model/map.store'
import { createBasemapController, type MapTheme } from './basemap-controller'
import { createCameraController, OPERATING_SITE } from './camera-controller'
import { createClusterLayer } from './cluster-layer'
import { createContentController } from './content-controller'
import { createGeofenceLayer, type GeofenceOverlay } from './geofence-layer'
import { createMissionLayer, type MissionOverlay } from './mission-layer'
import { readMapPalette } from './palette'
import { createUavLayer } from './uav-layer'

export type { MapTheme }

/** Sharper tiles in tilted views than Cesium's default (2). */
const MAXIMUM_SCREEN_SPACE_ERROR = 1.5
/** Cap the render resolution to keep 4K/5K displays smooth. */
const MAX_PIXEL_RATIO = 2

export interface MapSceneOptions {
  container: HTMLElement
  creditContainer: HTMLElement
  theme: MapTheme
  basemap: MapBasemap
  perspective: MapPerspective
  /**
   * Cesium ion: World Terrain, ion satellite imagery and 3D buildings. Without it the map uses
   * keyless Esri imagery on the ellipsoid and 3D is a plain tilted view.
   */
  ionToken: string | null
  /** Ion satellite imagery failed (e.g. invalid token); Satellite falls back to Esri. */
  onIonImageryUnavailable?: () => void
  onSelect: (uavId: string | null) => void
  /** Ground point clicked while drawing mode is on. */
  onDraw: (point: GeoPoint) => void
  /** The camera stopped following on its own (e.g. zooming into a cluster). */
  onFollowStopped: () => void
  /** Panels already covering the map, so the first view is framed in the free area. */
  viewportInsets: ViewportInsets
  /** Start high above the operating area with content hidden, awaiting `arrive()`. */
  startInOrbit?: boolean
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
  /** Panels covering the map; the camera frames targets in the area they leave free. */
  setViewportInsets(insets: ViewportInsets): void
  /** While drawing, clicks add area points instead of selecting UAVs. */
  setDrawing(drawing: boolean): void
  home(): void
  /**
   * Resolves once the first view is complete (terrain in place, visible tiles loaded) or after a
   * bounded wait, so the map can appear once instead of building up in visible steps.
   */
  whenFirstViewReady(): Promise<void>
  /** Opening arrival from orbit into the home view. */
  arrive(durationMs: number): void
  /** Shows or hides map content (UAVs, clusters, mission and no-fly overlays). */
  setContentVisible(visible: boolean): void
  focusUav(uavId: string): void
  follow(uavId: string | null): void
  destroy(): void
}

/**
 * A fixed daylight from the upper south-east of the operating site: 3D buildings read the same at
 * any hour (Cesium's default sun follows the clock, which leaves them black at night).
 */
function fixedDaylight(): DirectionalLight {
  const site = Cartesian3.fromDegrees(OPERATING_SITE.longitude, OPERATING_SITE.latitude)
  const local = Cartesian3.normalize(new Cartesian3(-0.35, 0.45, -0.82), new Cartesian3())
  const direction = Matrix4.multiplyByPointAsVector(
    Transforms.eastNorthUpToFixedFrame(site),
    local,
    new Cartesian3(),
  )
  return new DirectionalLight({ direction, intensity: 2 })
}

export function createMapScene({
  container,
  creditContainer,
  theme: initialTheme,
  basemap: initialBasemap,
  perspective: initialPerspective,
  ionToken,
  onIonImageryUnavailable,
  onSelect,
  onDraw,
  onFollowStopped,
  viewportInsets,
  startInOrbit = false,
}: MapSceneOptions): MapScene {
  if (ionToken) Ion.defaultAccessToken = ionToken

  let basemap = initialBasemap
  let perspective = initialPerspective

  const viewer = new Viewer(container, {
    // The basemap controller owns the imagery layers.
    baseLayer: false,
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
  scene.light = fixedDaylight()
  if (scene.moon) scene.moon.show = false
  scene.screenSpaceCameraController.maximumZoomDistance = 60_000
  applySceneColors()

  const layer = createUavLayer(viewer, palette)
  layer.setModelsEnabled(perspective === '3d')
  const clusters = createClusterLayer(viewer, layer, palette)
  const missionLayer = createMissionLayer(viewer, palette)
  const geofenceLayer = createGeofenceLayer(viewer, palette)
  let drawing = false

  function setGroundHeight(meters: number) {
    layer.setGroundHeight(meters)
    missionLayer.setGroundHeight(meters)
  }
  const camera = createCameraController(viewer, layer, perspective === '3d', onFollowStopped)
  camera.setInsets(viewportInsets)
  if (startInOrbit) {
    camera.orbit()
    viewer.entities.show = false
  } else {
    camera.home(false)
  }

  const basemaps = createBasemapController(scene, {
    theme: initialTheme,
    basemap,
    ionToken,
    onIonImageryUnavailable,
  })
  const content = createContentController(viewer, {
    buildingColor: palette.building,
    ionToken,
    basemap,
    perspective,
    setGroundHeight,
  })

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
  /*
   * Hover picking renders a pick pass, so it runs at most once per animation frame (with the
   * latest pointer position) and not while the camera moves; a pending hover is resolved when the
   * camera stops.
   */
  let lastHovered: string | null = null
  const hoverPosition = new Cartesian2()
  let hoverFrame: number | null = null
  let hoverPending = false
  let cameraMoving = false

  function resolveHover() {
    hoverFrame = null
    if (cameraMoving || drawing) return
    hoverPending = false
    const target = pick(hoverPosition)
    scene.canvas.style.cursor = target ? 'pointer' : ''
    const hovered = target?.kind === 'uav' ? target.uavId : null
    if (hovered !== lastHovered) {
      lastHovered = hovered
      layer.setHovered(hovered)
      scene.requestRender()
    }
  }
  function scheduleHover() {
    if (hoverFrame === null) hoverFrame = requestAnimationFrame(resolveHover)
  }
  const removeMoveStart = viewer.camera.moveStart.addEventListener(() => {
    cameraMoving = true
  })
  const removeMoveEnd = viewer.camera.moveEnd.addEventListener(() => {
    cameraMoving = false
    if (hoverPending) scheduleHover()
  })

  handler.setInputAction((event: { endPosition: Cartesian2 }) => {
    if (drawing) {
      scene.canvas.style.cursor = 'crosshair'
      return
    }
    Cartesian2.clone(event.endPosition, hoverPosition)
    hoverPending = true
    scheduleHover()
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
      palette = readMapPalette()
      applySceneColors()
      layer.setPalette(palette)
      clusters.setPalette(palette)
      missionLayer.setPalette(palette)
      geofenceLayer.setPalette(palette)
      content.setBuildingColor(palette.building)
      basemaps.setTheme(next)
    }),
    setBasemap: withRender((next: MapBasemap) => {
      if (next === basemap) return
      basemap = next
      basemaps.setBasemap(next)
      content.update({ basemap, perspective })
    }),
    setPerspective: withRender((next: MapPerspective) => {
      if (next === perspective) return
      perspective = next
      camera.setTilted(perspective === '3d')
      layer.setModelsEnabled(perspective === '3d')
      content.update({ basemap, perspective })
    }),
    // Camera flights render on their own (camera changes trigger frames).
    home: () => {
      camera.home(true)
    },
    whenFirstViewReady: content.whenFirstViewReady,
    arrive: (durationMs: number) => {
      camera.arrive(durationMs / 1000)
    },
    setContentVisible: withRender((visible: boolean) => {
      viewer.entities.show = visible
    }),
    focusUav: (uavId) => {
      camera.focusUav(uavId)
    },
    setViewportInsets: (insets: ViewportInsets) => {
      camera.setInsets(insets)
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
      removeMoveStart()
      removeMoveEnd()
      camera.destroy()
      if (hoverFrame !== null) cancelAnimationFrame(hoverFrame)
      content.destroy()
      basemaps.destroy()
      handler.destroy()
      clusters.destroy()
      missionLayer.destroy()
      geofenceLayer.destroy()
      layer.destroy()
      viewer.destroy()
    },
  }
}

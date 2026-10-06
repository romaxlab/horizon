import {
  Cartographic,
  Cesium3DTileStyle,
  type Color,
  createGooglePhotorealistic3DTileset,
  createOsmBuildingsAsync,
  createWorldTerrainAsync,
  sampleTerrainMostDetailed,
  type Cesium3DTileset,
  type Viewer,
} from 'cesium'
import type { MapBasemap, MapPerspective } from '../../store/map.store'
import { OPERATING_SITE } from './camera-controller'
import { afterTilesLoaded } from './scene-tiles'

type ContentSource = 'google-photorealistic' | 'terrain-osm-buildings'

/** Don't hold the first view for terrain longer than this; it then swaps in later. */
const TERRAIN_WAIT_MS = 3_000

/**
 * What the globe stands on and carries: Cesium World Terrain (every view, with an ion token) and
 * 3D content in the 3D perspective (Google photorealistic tiles or OSM buildings), plus the
 * ground height map content is lifted by, and when the first view is complete.
 */
export function createContentController(
  viewer: Viewer,
  options: {
    ionToken: string | null
    basemap: MapBasemap
    perspective: MapPerspective
    setGroundHeight: (meters: number) => void
    /** Theme color for OSM buildings. */
    buildingColor: Color
  },
) {
  const { scene } = viewer
  const { ionToken, setGroundHeight } = options
  let { basemap, perspective, buildingColor } = options
  const buildingStyle = () =>
    new Cesium3DTileStyle({ color: `color('${buildingColor.toCssColorString()}')` })

  type ContentKind = 'photorealistic' | 'buildings'

  /** 3D content shown in the 3D perspective (Google tiles or OSM buildings). */
  let content3d: { tileset: Cesium3DTileset; source: ContentSource } | null = null
  /** What the current basemap + perspective ask for; null means no 3D content. */
  let wantedContent: ContentKind | null = null
  /** Ground height of the loaded World Terrain at the operating site (0 on the ellipsoid). */
  let terrainGroundHeight = 0
  let terrainLoading: Promise<void> | null = null
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

  /** Terrain loads once and stays, so later switches don't rebuild the globe. */
  function ensureTerrain(): Promise<void> {
    terrainLoading ??= (async () => {
      const terrain = await createWorldTerrainAsync()
      if (viewer.isDestroyed()) return
      viewer.terrainProvider = terrain
      try {
        const [sample] = await sampleTerrainMostDetailed(terrain, [site()])
        terrainGroundHeight = sample?.height ?? 0
      } catch {
        terrainGroundHeight = 0
      }
    })().catch((error: unknown) => {
      terrainLoading = null
      throw error
    })
    return terrainLoading
  }

  /** Removes 3D content: the globe comes back first; content goes once the globe is ready. */
  function clearContent() {
    const previous = content3d
    content3d = null
    scene.globe.show = true
    setGroundHeight(terrainGroundHeight)
    if (previous) {
      afterTilesLoaded(scene, () => {
        if (content3d?.tileset !== previous.tileset) scene.primitives.remove(previous.tileset)
      })
    }
  }

  function showContent(tileset: Cesium3DTileset, source: ContentSource, request: number) {
    const previous = content3d
    content3d = { tileset, source }
    scene.primitives.add(tileset)
    if (previous) scene.primitives.remove(previous.tileset)
    if (source !== 'google-photorealistic') {
      // Buildings stand on the globe; it may still be hidden by photorealistic tiles they replace.
      scene.globe.show = true
      return
    }
    // Photorealistic tiles include the ground; hide the globe only once they are visible.
    const remove = tileset.initialTilesLoaded.addEventListener(() => {
      remove()
      if (request === contentRequest && content3d?.tileset === tileset) scene.globe.show = false
    })
  }

  /** Cesium World Terrain + Cesium OSM Buildings. */
  async function loadBuildings(): Promise<Cesium3DTileset> {
    const [buildings] = await Promise.all([
      createOsmBuildingsAsync({ style: buildingStyle() }),
      ensureTerrain(),
    ])
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

  // Cesium World Terrain under every view when ion is available; the ellipsoid otherwise.
  const terrainSettled: Promise<void> = ionToken
    ? ensureTerrain().then(
        () => {
          // Photorealistic tiles carry their own ground height.
          if (!viewer.isDestroyed() && wantedContent !== 'photorealistic') {
            setGroundHeight(terrainGroundHeight)
            scene.requestRender()
          }
        },
        (error: unknown) => {
          console.warn('[map] Cesium World Terrain unavailable; using the ellipsoid', error)
        },
      )
    : Promise.resolve()

  // Terrain swapped in after the first tiles would rebuild every tile on screen (a second,
  // different-looking map); the first view waits for it, then for its tiles.
  const firstViewReady = Promise.race([
    terrainSettled,
    new Promise<void>((resolve) => setTimeout(resolve, TERRAIN_WAIT_MS)),
  ]).then(
    () =>
      new Promise<void>((resolve) => {
        if (viewer.isDestroyed()) resolve()
        else afterTilesLoaded(scene, resolve)
      }),
  )

  return {
    /** 3D content follows basemap + perspective. */
    update(next: { basemap: MapBasemap; perspective: MapPerspective }) {
      ;({ basemap, perspective } = next)
      updateContent()
    },
    whenFirstViewReady: () => firstViewReady,
    /** Recolors the buildings for the theme. */
    setBuildingColor(color: Color) {
      buildingColor = color
      if (content3d?.source === 'terrain-osm-buildings') content3d.tileset.style = buildingStyle()
    },
    /** Discards loads still in flight. */
    destroy() {
      contentRequest += 1
    },
  }
}

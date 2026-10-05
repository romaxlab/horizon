import { distanceMeters, type UavState, type UavStatus } from '@horizon/domain'
import {
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Math as CesiumMath,
  ColorBlendMode,
  ColorMaterialProperty,
  ConstantPositionProperty,
  ConstantProperty,
  DistanceDisplayCondition,
  HeadingPitchRoll,
  HorizontalOrigin,
  NearFarScalar,
  Transforms,
  VerticalOrigin,
  type Color,
  type Quaternion,
  type Entity,
  type Viewer,
} from 'cesium'
import {
  createPoseTrack,
  RENDER_DELAY_MS,
  type Pose,
  type PoseTrack,
} from '@/shared/lib/pose-track'
import {
  getLabelPill,
  getSelectionRing,
  LABEL_MARGIN,
  MARKER_SIZE,
  RING_SIZE,
  uavMarkerUrl,
  type UavMarkerState,
} from './marker-images'
import type { MapPalette } from './palette'

const TRAIL_MIN_SPACING_METERS = 15
/** Trail length cap: the last ~3.6 km flown; older points drop off so cost never grows. */
const TRAIL_MAX_POINTS = 240
const EMPTY_POSITIONS: Cartesian3[] = []
const ENTITY_PREFIX = 'uav:'
/** Name labels belong to their UAV for picking purposes. */
const LABEL_ID_PREFIX = 'uav-label:'
/** Stale UAVs share the warning artwork; the inspector tells the two apart. */
const MARKER_STATE: Record<UavStatus, UavMarkerState> = {
  standby: 'standby',
  active: 'active',
  warning: 'warning',
  stale: 'warning',
  offline: 'offline',
}
/** Slightly smaller markers at medium distance; clustering takes over further out. */
const MARKER_SCALE_BY_DISTANCE = new NearFarScalar(1_500, 1, 10_000, 0.8)
/**
 * 3D perspective, close in: the aircraft model instead of the icon (same silhouette, built from
 * the icon). Further out, and in 2D, the icon reads better and costs less.
 */
const UAV_MODEL_URL = `${import.meta.env.BASE_URL}assets/uav/uav.glb`
const MODEL_MAX_DISTANCE_METERS = 3_000
const MODEL_MIN_PIXEL_SIZE = 56
const NEAR_ONLY = new DistanceDisplayCondition(0, MODEL_MAX_DISTANCE_METERS)
const FAR_ONLY = new DistanceDisplayCondition(MODEL_MAX_DISTANCE_METERS, Number.POSITIVE_INFINITY)
/** Gap between the selected marker's dot and its name label (CSS px). */
const LABEL_GAP_PX = 4

interface UavEntry {
  id: string
  name: string
  entity: Entity
  /** Flown path: constant geometry, rebuilt only when a trail point is added. */
  trailEntity: Entity
  /** Short live segment from the last trail point to the marker (two reused points). */
  trailHeadEntity: Entity
  track: PoseTrack
  /** Interpolated pose at the current render time. */
  pose: () => Pose | null
  lastTimestamp: number
  status: UavStatus
  /** Telemetry poses flown during the current mission. */
  trail: Pose[]
  /** Trail points converted once (ground height applied at push time). */
  trailPositions: Cartesian3[]
  /**
   * Per-frame cost control: `moving` UAVs use per-frame callbacks; parked ones get constant
   * properties Cesium never re-evaluates. Visibility flags are pushed only when they change.
   */
  flags: {
    airborne: boolean
    moving: boolean
    parkedSamples: number
    shown: VisibilityState | null
  }
  /** Position of a stationary UAV (no per-frame interpolation needed). */
  stationaryPosition: Cartesian3 | null
  /** Per-frame properties used while moving. */
  dynamic: {
    position: CallbackPositionProperty
    rotation: CallbackProperty
    orientation: CallbackProperty
  }
}

export interface UavLayer {
  /** Full fleet: creates/updates entities and removes UAVs that are gone. */
  sync(states: readonly UavState[]): void
  /** Only the UAVs whose state changed since the last update (realtime deltas). */
  update(changed: readonly UavState[]): void
  select(uavId: string | null): void
  /**
   * Ellipsoidal height of the ground at the operating site. Telemetry altitude is above ground
   * level; this lifts it onto terrain or 3D tiles (0 on the bare ellipsoid).
   */
  setGroundHeight(meters: number): void
  setPalette(palette: MapPalette): void
  /** 3D perspective: aircraft models within a few km, icons beyond; off: icons only. */
  setModelsEnabled(enabled: boolean): void
  getEntity(uavId: string): Entity | undefined
  /** Current rendered position of a UAV. */
  positionOf(uavId: string): Cartesian3 | undefined
  /** Rendered markers that may be clustered (everything except the selected UAV). */
  clusterableMarkers(): { id: string; status: UavStatus; position: Cartesian3 }[]
  /** UAVs currently represented by a cluster; their individual markers are hidden. */
  setClustered(uavIds: ReadonlySet<string>): void
  /** True while any UAV is moving (interpolated): the scene must keep rendering. */
  isAnimating(): boolean
  /** UAV under the pointer; it gets a name label like the selected one. */
  setHovered(uavId: string | null): void
  uavIdFromPick(picked: unknown): string | null
  destroy(): void
}

interface VisibilityState {
  marker: boolean
  dropLine: boolean
  trail: boolean
}

/** Consecutive parked samples after which a UAV is treated as stationary. */
const STATIONARY_AFTER_SAMPLES = 2

/** Renders UAVs as heading-aware markers with smooth interpolation, drop lines and trails. */
export function createUavLayer(viewer: Viewer, initialPalette: MapPalette): UavLayer {
  const entries = new Map<string, UavEntry>()
  let palette = initialPalette
  let selectedId: string | null = null
  /** Aircraft models near the camera (3D perspective); icons only otherwise. */
  let models = false
  const scratchPosition = new Cartesian3()
  const scratchHpr = new HeadingPitchRoll()

  /** Model attitude for a pose: the compass heading, level flight. */
  function orientationOf(pose: Pose, result?: Quaternion): Quaternion {
    // The model's nose is glTF +X; Cesium's axis correction (glTF Y-up, Z-forward) turns it
    // north at heading 0, so the compass heading applies as is.
    scratchHpr.heading = CesiumMath.toRadians(pose.heading)
    return Transforms.headingPitchRollQuaternion(
      toCartesian(pose, scratchPosition),
      scratchHpr,
      undefined,
      undefined,
      result,
    )
  }
  let groundHeight = 0
  let clustered: ReadonlySet<string> = new Set()
  let hoveredId: string | null = null
  /** UAVs with interpolated (per-frame) motion; new entries start moving until parked. */
  let movingCount = 0

  function toCartesian(pose: Pose, result?: Cartesian3): Cartesian3 {
    const height = groundHeight + pose.altitude
    return Cartesian3.fromDegrees(pose.longitude, pose.latitude, height, undefined, result)
  }

  /** Ground point under a pose (drop line foot), written into `result`. */
  function groundUnder(pose: Pose, result?: Cartesian3): Cartesian3 {
    return Cartesian3.fromDegrees(pose.longitude, pose.latitude, groundHeight, undefined, result)
  }

  function statusColor(status: UavStatus): Color {
    switch (status) {
      case 'active':
        return palette.selected
      case 'warning':
      case 'stale':
        return palette.warning
      case 'offline':
        return palette.danger
      case 'standby':
        return palette.standby
    }
  }

  /**
   * Name labels: one follows the selected UAV, one the hovered UAV. Other UAVs are never
   * labelled, so the map stays clean.
   */
  function createNameLabel(role: string, target: () => string | null) {
    const entity = viewer.entities.add({
      id: `${LABEL_ID_PREFIX}${role}`,
      show: false,
      position: new CallbackPositionProperty((_time, result) => {
        const id = target()
        const pose = id && !clustered.has(id) ? entries.get(id)?.pose() : null
        return pose ? toCartesian(pose, result) : undefined
      }, false),
      billboard: {
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -(MARKER_SIZE / 2 + LABEL_GAP_PX - LABEL_MARGIN)),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })

    return {
      entity,
      update() {
        const id = target()
        const entry = id ? entries.get(id) : undefined
        entity.show = entry !== undefined
        if (!entry || !entity.billboard) return
        const pill = getLabelPill(entry.name, {
          surface: palette.surfaceRaised,
          text: palette.textPrimary,
          shadow: palette.shadow,
        })
        entity.billboard.image = new ConstantProperty(pill.image)
        entity.billboard.width = new ConstantProperty(pill.width)
        entity.billboard.height = new ConstantProperty(pill.height)
      },
    }
  }

  /** Selection: the UAV's own marker plus a ring around it, at the same size. */
  const selectionRing = (() => {
    const entity = viewer.entities.add({
      id: `${LABEL_ID_PREFIX}ring`,
      show: false,
      position: new CallbackPositionProperty((_time, result) => {
        const pose =
          selectedId && !clustered.has(selectedId) ? entries.get(selectedId)?.pose() : null
        return pose ? toCartesian(pose, result) : undefined
      }, false),
      billboard: {
        width: RING_SIZE,
        height: RING_SIZE,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        scaleByDistance: MARKER_SCALE_BY_DISTANCE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    return {
      entity,
      update() {
        entity.show = selectedId !== null && entries.has(selectedId)
        if (entity.billboard)
          entity.billboard.image = new ConstantProperty(getSelectionRing(palette.markerSelection))
      },
    }
  })()
  const selectionLabel = createNameLabel('selected', () => selectedId)
  const hoverLabel = createNameLabel('hovered', () => (hoveredId !== selectedId ? hoveredId : null))

  function applyStyle(entry: UavEntry) {
    // Colors always follow the status; selection is shown by the ring and label only, so
    // selecting a UAV never makes it look like it changed state.
    const color = statusColor(entry.status)
    const { billboard, polyline } = entry.entity
    if (billboard) billboard.image = new ConstantProperty(uavMarkerUrl(MARKER_STATE[entry.status]))
    const { model } = entry.entity
    if (model) {
      model.color = new ConstantProperty(color)
      // The selection ring is flat; the model also gets an outline that follows its shape.
      const selected = entry.id === selectedId
      model.silhouetteColor = new ConstantProperty(palette.markerSelection)
      model.silhouetteSize = new ConstantProperty(selected ? 2 : 0)
    }
    if (polyline) polyline.material = new ColorMaterialProperty(color.withAlpha(0.35))
    // Trails stay quieter than the markers, so the aircraft keep the attention.
    const trailMaterial = new ColorMaterialProperty(color.withAlpha(0.3))
    if (entry.trailEntity.polyline) entry.trailEntity.polyline.material = trailMaterial
    if (entry.trailHeadEntity.polyline) entry.trailHeadEntity.polyline.material = trailMaterial
  }

  function createEntry(state: UavState): UavEntry {
    const track = createPoseTrack()
    // Several properties read the pose every frame; interpolate once per millisecond.
    let cachedAt = -1
    let cached: Pose | null = null
    const pose = () => {
      const now = Date.now()
      if (now !== cachedAt) {
        cachedAt = now
        cached = track.sampleAt(now - RENDER_DELAY_MS)
      }
      return cached
    }
    const trail: Pose[] = []
    const trailPositions: Cartesian3[] = []
    // Scratch points reused every frame by the per-frame line callbacks.
    const dropLine = [new Cartesian3(), new Cartesian3()]
    const trailHead = [new Cartesian3(), new Cartesian3()]
    const id = state.uav.id
    const flags = { airborne: false, moving: true, parkedSamples: 0, shown: null }
    const dynamic = {
      position: new CallbackPositionProperty((_time, result) => {
        const current = pose()
        return current ? toCartesian(current, result) : undefined
      }, false),
      rotation: new CallbackProperty(() => -CesiumMath.toRadians(pose()?.heading ?? 0), false),
      orientation: new CallbackProperty((_time, result?: Quaternion) => {
        const current = pose()
        return current ? orientationOf(current, result) : undefined
      }, false),
    }

    const entity = viewer.entities.add({
      id: `${ENTITY_PREFIX}${id}`,
      position: dynamic.position,
      orientation: dynamic.orientation,
      model: {
        uri: UAV_MODEL_URL,
        show: false,
        minimumPixelSize: MODEL_MIN_PIXEL_SIZE,
        distanceDisplayCondition: NEAR_ONLY,
        // The model is neutral light gray; the status color tints it like the icon.
        colorBlendMode: ColorBlendMode.MIX,
        colorBlendAmount: 0.55,
      },
      billboard: {
        // Aligned to the globe's north so rotation is a true compass heading in any camera view.
        alignedAxis: Cartesian3.UNIT_Z,
        rotation: dynamic.rotation,
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        scaleByDistance: MARKER_SCALE_BY_DISTANCE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      // Drop line to the ground: altitude cue in a tilted view. Two reused points, no
      // per-frame allocation; hidden lines skip position evaluation in Cesium.
      polyline: {
        width: 1,
        show: false,
        positions: new CallbackProperty(() => {
          const current = pose()
          if (!current) return EMPTY_POSITIONS
          groundUnder(current, dropLine[0])
          toCartesian(current, dropLine[1])
          return dropLine
        }, false),
      },
    })

    const trailEntity = viewer.entities.add({
      polyline: { width: 1.5, show: false, positions: new ConstantProperty([]) },
    })
    const trailHeadEntity = viewer.entities.add({
      polyline: {
        width: 1.5,
        show: false,
        positions: new CallbackProperty(() => {
          const current = pose()
          const last = trailPositions.at(-1)
          if (!current || !last) return EMPTY_POSITIONS
          Cartesian3.clone(last, trailHead[0])
          toCartesian(current, trailHead[1])
          return trailHead
        }, false),
      },
    })

    const entry: UavEntry = {
      id,
      name: state.uav.name,
      entity,
      trailEntity,
      trailHeadEntity,
      track,
      pose,
      lastTimestamp: -Infinity,
      status: state.status,
      trail,
      trailPositions,
      flags,
      dynamic,
      stationaryPosition: null,
    }
    applyStyle(entry)
    refreshVisibility(entry)
    return entry
  }

  /** Pushes marker/line visibility to Cesium only when it actually changes. */
  function refreshVisibility(entry: UavEntry, force = false) {
    const marker = !clustered.has(entry.id)
    const next: VisibilityState = {
      marker,
      dropLine: marker && entry.flags.airborne,
      trail: entry.trail.length > 0,
    }
    const shown = entry.flags.shown
    if (
      !force &&
      shown?.marker === next.marker &&
      shown.dropLine === next.dropLine &&
      shown.trail === next.trail
    ) {
      return
    }
    entry.flags.shown = next
    if (entry.entity.billboard) entry.entity.billboard.show = new ConstantProperty(next.marker)
    if (entry.entity.model) entry.entity.model.show = new ConstantProperty(next.marker && models)
    if (entry.entity.polyline) entry.entity.polyline.show = new ConstantProperty(next.dropLine)
    if (entry.trailEntity.polyline) {
      entry.trailEntity.polyline.show = new ConstantProperty(next.trail)
    }
    if (entry.trailHeadEntity.polyline) {
      entry.trailHeadEntity.polyline.show = new ConstantProperty(next.trail)
    }
  }

  /**
   * Parked UAVs switch to constant position/rotation (no per-frame work); any movement switches
   * back to interpolated callbacks. Waiting for a few parked samples lets the interpolation
   * (rendered slightly in the past) finish landing first.
   */
  function updateMotion(entry: UavEntry, state: UavState) {
    const telemetry = state.telemetry
    if (!telemetry) return
    const parked = telemetry.flightPhase === 'parked' && telemetry.speed === 0
    entry.flags.parkedSamples = parked ? entry.flags.parkedSamples + 1 : 0
    const moving = entry.flags.parkedSamples < STATIONARY_AFTER_SAMPLES
    if (moving === entry.flags.moving) return
    entry.flags.moving = moving
    movingCount += moving ? 1 : -1
    const { billboard } = entry.entity
    if (moving) {
      entry.stationaryPosition = null
      entry.entity.position = entry.dynamic.position
      entry.entity.orientation = entry.dynamic.orientation
      if (billboard) billboard.rotation = entry.dynamic.rotation
      return
    }
    const pose: Pose = { ...telemetry.position, heading: telemetry.heading }
    entry.stationaryPosition = toCartesian(pose)
    entry.entity.position = new ConstantPositionProperty(entry.stationaryPosition)
    entry.entity.orientation = new ConstantProperty(orientationOf(pose))
    if (billboard) billboard.rotation = new ConstantProperty(-CesiumMath.toRadians(pose.heading))
  }

  function updateTrail(entry: UavEntry, state: UavState) {
    const telemetry = state.telemetry
    entry.flags.airborne = (telemetry?.position.altitude ?? 0) >= 2
    if (!telemetry?.missionId) {
      if (entry.trail.length === 0) return
      entry.trail.length = 0
      entry.trailPositions.length = 0
      commitTrail(entry)
      return
    }
    const point: Pose = { ...telemetry.position, heading: telemetry.heading }
    const last = entry.trail.at(-1)
    if (!last || distanceMeters(last, point) >= TRAIL_MIN_SPACING_METERS) {
      entry.trail.push(point)
      entry.trailPositions.push(toCartesian(point))
      if (entry.trail.length > TRAIL_MAX_POINTS) {
        entry.trail.shift()
        entry.trailPositions.shift()
      }
      commitTrail(entry)
    }
  }

  /** Hands the flown path to Cesium as constant geometry (rebuilt per new point, not per frame). */
  function commitTrail(entry: UavEntry) {
    const line = entry.trailEntity.polyline
    if (line) line.positions = new ConstantProperty(entry.trailPositions.slice())
  }

  function removeEntities(entry: UavEntry) {
    viewer.entities.remove(entry.entity)
    viewer.entities.remove(entry.trailEntity)
    viewer.entities.remove(entry.trailHeadEntity)
  }

  /** Creates or updates one UAV's entities; only what changed is touched. */
  function upsert(state: UavState) {
    const existing = entries.get(state.uav.id)
    const entry = existing ?? createEntry(state)
    if (!existing) {
      entries.set(state.uav.id, entry)
      movingCount += 1
    }

    const telemetry = state.telemetry
    if (telemetry && state.lastUpdatedAt !== null && telemetry.timestamp > entry.lastTimestamp) {
      entry.lastTimestamp = telemetry.timestamp
      entry.track.push(telemetry.timestamp, state.lastUpdatedAt, {
        ...telemetry.position,
        heading: telemetry.heading,
      })
      updateTrail(entry, state)
      updateMotion(entry, state)
      refreshVisibility(entry)
    }
    if (entry.status !== state.status) {
      entry.status = state.status
      applyStyle(entry)
    }
  }

  return {
    sync(states) {
      const seen = new Set<string>()
      for (const state of states) {
        seen.add(state.uav.id)
        upsert(state)
      }
      for (const [id, entry] of entries) {
        if (seen.has(id)) continue
        if (entry.flags.moving) movingCount -= 1
        removeEntities(entry)
        entries.delete(id)
      }
      selectionLabel.update()
      selectionRing.update()
      hoverLabel.update()
    },

    update(changed) {
      for (const state of changed) upsert(state)
    },

    select(nextSelectedId) {
      if (nextSelectedId === selectedId) return
      const previous = selectedId ? entries.get(selectedId) : undefined
      selectedId = nextSelectedId
      const next = nextSelectedId ? entries.get(nextSelectedId) : undefined
      if (previous) applyStyle(previous)
      if (next) applyStyle(next)
      selectionLabel.update()
      selectionRing.update()
      hoverLabel.update()
    },

    setGroundHeight(meters) {
      groundHeight = meters
      // Constant (parked) positions bake the ground height in: re-place them.
      for (const entry of entries.values()) {
        if (entry.flags.moving) continue
        const latest = entry.pose()
        if (!latest) continue
        entry.stationaryPosition = toCartesian(latest)
        entry.entity.position = new ConstantPositionProperty(entry.stationaryPosition)
      }
      for (const entry of entries.values()) {
        entry.trailPositions.splice(0, Infinity, ...entry.trail.map((point) => toCartesian(point)))
        commitTrail(entry)
      }
    },

    setModelsEnabled(enabled) {
      if (enabled === models) return
      models = enabled
      entries.forEach((entry) => {
        if (entry.entity.billboard) {
          entry.entity.billboard.distanceDisplayCondition = new ConstantProperty(
            enabled ? FAR_ONLY : undefined,
          )
        }
        refreshVisibility(entry, true)
      })
    },

    setPalette(next) {
      palette = next
      entries.forEach(applyStyle)
      selectionLabel.update()
      selectionRing.update()
      hoverLabel.update()
    },

    getEntity: (uavId) => entries.get(uavId)?.entity,

    positionOf(uavId) {
      const entry = entries.get(uavId)
      if (!entry) return undefined
      if (entry.stationaryPosition) return entry.stationaryPosition
      const pose = entry.pose()
      return pose ? toCartesian(pose) : undefined
    },

    clusterableMarkers() {
      const markers: { id: string; status: UavStatus; position: Cartesian3 }[] = []
      for (const entry of entries.values()) {
        if (entry.id === selectedId) continue
        const position = this.positionOf(entry.id)
        if (position) markers.push({ id: entry.id, status: entry.status, position })
      }
      return markers
    },

    setClustered(uavIds) {
      clustered = uavIds
      entries.forEach((entry) => {
        refreshVisibility(entry)
      })
    },

    isAnimating: () => movingCount > 0,

    setHovered(uavId) {
      if (uavId === hoveredId) return
      hoveredId = uavId
      hoverLabel.update()
    },

    uavIdFromPick(picked) {
      const id = (picked as { id?: { id?: unknown } } | undefined)?.id?.id
      // Clicking a name label or the selection ring acts on its UAV.
      if (id === `${LABEL_ID_PREFIX}selected` || id === `${LABEL_ID_PREFIX}ring`) return selectedId
      if (id === `${LABEL_ID_PREFIX}hovered`) return hoveredId
      return typeof id === 'string' && id.startsWith(ENTITY_PREFIX)
        ? id.slice(ENTITY_PREFIX.length)
        : null
    },

    destroy() {
      entries.forEach(removeEntities)
      entries.clear()
      movingCount = 0
      viewer.entities.remove(selectionLabel.entity)
      viewer.entities.remove(selectionRing.entity)
      viewer.entities.remove(hoverLabel.entity)
    },
  }
}

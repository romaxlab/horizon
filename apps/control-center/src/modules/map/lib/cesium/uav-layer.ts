import { distanceMeters, type UavState, type UavStatus } from '@horizon/domain'
import {
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Math as CesiumMath,
  ColorMaterialProperty,
  ConstantProperty,
  HorizontalOrigin,
  NearFarScalar,
  VerticalOrigin,
  type Color,
  type Entity,
  type Viewer,
} from 'cesium'
import { createPoseTrack, type Pose, type PoseTrack } from '@/shared/lib/pose-track'
import { getLabelPill, getUavMarker, MARKER_SIZE } from './marker-images'
import type { MapPalette } from './palette'

/** Render slightly in the past so there is always a newer sample to interpolate toward. */
const RENDER_DELAY_MS = 500
const TRAIL_MIN_SPACING_METERS = 15
const ENTITY_PREFIX = 'uav:'
/** Name labels belong to their UAV for picking purposes. */
const LABEL_ID_PREFIX = 'uav-label:'
/** Selected UAVs are emphasized by a focus ring and a modest scale-up, not by size alone. */
const SELECTED_SCALE = 1.15
/** Slightly smaller markers at medium distance; clustering takes over further out. */
const MARKER_SCALE_BY_DISTANCE = new NearFarScalar(1_500, 1, 10_000, 0.8)
/** Gap between the selected marker's dot and its name label (CSS px). */
const LABEL_GAP_PX = 4

interface UavEntry {
  id: string
  name: string
  entity: Entity
  trailEntity: Entity
  track: PoseTrack
  /** Interpolated pose at the current render time. */
  pose: () => Pose | null
  lastTimestamp: number
  status: UavStatus
  /** Telemetry poses flown during the current mission (converted at render time). */
  trail: Pose[]
}

export interface UavLayer {
  sync(states: readonly UavState[], selectedUavId: string | null): void
  /**
   * Ellipsoidal height of the ground at the operating site. Telemetry altitude is above ground
   * level; this lifts it onto terrain or 3D tiles (0 on the bare ellipsoid).
   */
  setGroundHeight(meters: number): void
  setPalette(palette: MapPalette): void
  getEntity(uavId: string): Entity | undefined
  /** Current rendered position of a UAV. */
  positionOf(uavId: string): Cartesian3 | undefined
  /** Rendered markers that may be clustered (everything except the selected UAV). */
  clusterableMarkers(): { id: string; status: UavStatus; position: Cartesian3 }[]
  /** UAVs currently represented by a cluster; their individual markers are hidden. */
  setClustered(uavIds: ReadonlySet<string>): void
  /** UAV under the pointer; it gets a name label like the selected one. */
  setHovered(uavId: string | null): void
  uavIdFromPick(picked: unknown): string | null
  destroy(): void
}

/** Renders UAVs as heading-aware markers with smooth interpolation, drop lines and trails. */
export function createUavLayer(viewer: Viewer, initialPalette: MapPalette): UavLayer {
  const entries = new Map<string, UavEntry>()
  let palette = initialPalette
  let selectedId: string | null = null
  let groundHeight = 0
  let clustered: ReadonlySet<string> = new Set()
  let hoveredId: string | null = null

  function toCartesian(pose: Pose, result?: Cartesian3): Cartesian3 {
    const height = groundHeight + pose.altitude
    return Cartesian3.fromDegrees(pose.longitude, pose.latitude, height, undefined, result)
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
        pixelOffset: new Cartesian2(0, -((MARKER_SIZE / 2) * SELECTED_SCALE + LABEL_GAP_PX)),
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
          surface: palette.surface,
          text: palette.textPrimary,
          shadow: palette.shadow,
        })
        entity.billboard.image = new ConstantProperty(pill.image)
        entity.billboard.width = new ConstantProperty(pill.width)
        entity.billboard.height = new ConstantProperty(pill.height)
      },
    }
  }

  const selectionLabel = createNameLabel('selected', () => selectedId)
  const hoverLabel = createNameLabel('hovered', () => (hoveredId !== selectedId ? hoveredId : null))

  function applyStyle(entry: UavEntry) {
    const selected = entry.id === selectedId
    const color = statusColor(entry.status)
    const { billboard, polyline } = entry.entity
    if (billboard) {
      billboard.image = new ConstantProperty(
        getUavMarker({
          fill: color,
          halo: palette.halo,
          shadow: palette.shadow,
          focus: selected ? palette.selected : undefined,
        }),
      )
      billboard.scale = new ConstantProperty(selected ? SELECTED_SCALE : 1)
    }
    if (polyline) polyline.material = new ColorMaterialProperty(color.withAlpha(0.35))
    const trailLine = entry.trailEntity.polyline
    if (trailLine) {
      trailLine.material = new ColorMaterialProperty(
        (selected ? palette.selected : color).withAlpha(selected ? 0.75 : 0.5),
      )
    }
  }

  function createEntry(state: UavState): UavEntry {
    const track = createPoseTrack()
    const pose = () => track.sampleAt(Date.now() - RENDER_DELAY_MS)
    const trail: Pose[] = []
    const id = state.uav.id

    const entity = viewer.entities.add({
      id: `${ENTITY_PREFIX}${id}`,
      position: new CallbackPositionProperty((_time, result) => {
        const current = pose()
        return current ? toCartesian(current, result) : undefined
      }, false),
      billboard: {
        show: new CallbackProperty(() => !clustered.has(id), false),
        // Aligned to the globe's north so rotation is a true compass heading in any camera view.
        alignedAxis: Cartesian3.UNIT_Z,
        rotation: new CallbackProperty(() => -CesiumMath.toRadians(pose()?.heading ?? 0), false),
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        scaleByDistance: MARKER_SCALE_BY_DISTANCE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      // Drop line to the ground: altitude cue in a tilted view.
      polyline: {
        width: 1,
        show: new CallbackProperty(() => !clustered.has(id), false),
        positions: new CallbackProperty(() => {
          const current = pose()
          if (!current || current.altitude < 2) return []
          return [toCartesian({ ...current, altitude: 0 }), toCartesian(current)]
        }, false),
      },
    })

    const trailEntity = viewer.entities.add({
      polyline: {
        width: 1.5,
        positions: new CallbackProperty(() => {
          const current = pose()
          return current && trail.length > 0
            ? [...trail.map((point) => toCartesian(point)), toCartesian(current)]
            : []
        }, false),
      },
    })

    const entry: UavEntry = {
      id,
      name: state.uav.name,
      entity,
      trailEntity,
      track,
      pose,
      lastTimestamp: -Infinity,
      status: state.status,
      trail,
    }
    applyStyle(entry)
    return entry
  }

  function updateTrail(entry: UavEntry, state: UavState) {
    const telemetry = state.telemetry
    if (!telemetry?.missionId) {
      entry.trail.length = 0
      return
    }
    const point: Pose = { ...telemetry.position, heading: telemetry.heading }
    const last = entry.trail.at(-1)
    if (!last || distanceMeters(last, point) >= TRAIL_MIN_SPACING_METERS) entry.trail.push(point)
  }

  return {
    sync(states, nextSelectedId) {
      const previousSelectedId = selectedId
      selectedId = nextSelectedId
      const seen = new Set<string>()

      for (const state of states) {
        seen.add(state.uav.id)
        const entry = entries.get(state.uav.id) ?? createEntry(state)
        entries.set(state.uav.id, entry)

        const telemetry = state.telemetry
        if (
          telemetry &&
          state.lastUpdatedAt !== null &&
          telemetry.timestamp > entry.lastTimestamp
        ) {
          entry.lastTimestamp = telemetry.timestamp
          entry.track.push(telemetry.timestamp, state.lastUpdatedAt, {
            ...telemetry.position,
            heading: telemetry.heading,
          })
          updateTrail(entry, state)
        }

        const selectionChanged =
          previousSelectedId !== selectedId &&
          (entry.id === selectedId || entry.id === previousSelectedId)
        if (selectionChanged || entry.status !== state.status) {
          entry.status = state.status
          applyStyle(entry)
        }
      }

      for (const [id, entry] of entries) {
        if (seen.has(id)) continue
        viewer.entities.remove(entry.entity)
        viewer.entities.remove(entry.trailEntity)
        entries.delete(id)
      }
      if (previousSelectedId !== selectedId) {
        selectionLabel.update()
        hoverLabel.update()
      }
    },

    setGroundHeight(meters) {
      groundHeight = meters
    },

    setPalette(next) {
      palette = next
      entries.forEach(applyStyle)
      selectionLabel.update()
      hoverLabel.update()
    },

    getEntity: (uavId) => entries.get(uavId)?.entity,

    positionOf(uavId) {
      const pose = entries.get(uavId)?.pose()
      return pose ? toCartesian(pose) : undefined
    },

    clusterableMarkers() {
      const markers: { id: string; status: UavStatus; position: Cartesian3 }[] = []
      for (const entry of entries.values()) {
        if (entry.id === selectedId) continue
        const pose = entry.pose()
        if (pose) markers.push({ id: entry.id, status: entry.status, position: toCartesian(pose) })
      }
      return markers
    },

    setClustered(uavIds) {
      clustered = uavIds
    },

    setHovered(uavId) {
      if (uavId === hoveredId) return
      hoveredId = uavId
      hoverLabel.update()
    },

    uavIdFromPick(picked) {
      const id = (picked as { id?: { id?: unknown } } | undefined)?.id?.id
      // Clicking a name label acts on its UAV.
      if (id === `${LABEL_ID_PREFIX}selected`) return selectedId
      if (id === `${LABEL_ID_PREFIX}hovered`) return hoveredId
      return typeof id === 'string' && id.startsWith(ENTITY_PREFIX)
        ? id.slice(ENTITY_PREFIX.length)
        : null
    },

    destroy() {
      entries.forEach((entry) => {
        viewer.entities.remove(entry.entity)
        viewer.entities.remove(entry.trailEntity)
      })
      entries.clear()
      viewer.entities.remove(selectionLabel.entity)
      viewer.entities.remove(hoverLabel.entity)
    },
  }
}

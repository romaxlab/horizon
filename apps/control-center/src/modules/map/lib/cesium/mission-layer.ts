import type { GeoPoint, GeoPosition } from '@horizon/domain'
import {
  Cartesian3,
  ClassificationType,
  ColorMaterialProperty,
  PolygonHierarchy,
  PolylineDashMaterialProperty,
  type Entity,
  type MaterialProperty,
  type Viewer,
} from 'cesium'
import type { MapPalette } from './palette'

/** Mission geometry to display; the map has no knowledge of mission planning itself. */
export interface MissionOverlay {
  /** `draft`: area being drawn · `planned`: reviewed, not launched · then `active` / `completed`. */
  phase: 'draft' | 'planned' | 'active' | 'completed'
  area: GeoPoint[]
  /** Scan routes per UAV; waypoint altitude is above ground. */
  routes: { uavId: string; waypoints: GeoPosition[] }[]
}

export interface MissionLayer {
  set(overlay: MissionOverlay | null): void
  setPalette(palette: MapPalette): void
  /** Ellipsoidal ground height at the operating site (see the UAV layer). */
  setGroundHeight(meters: number): void
  destroy(): void
}

/** Renders the mission area, routes and waypoints; rebuilt on change (overlays change rarely). */
export function createMissionLayer(viewer: Viewer, initialPalette: MapPalette): MissionLayer {
  let palette = initialPalette
  let overlay: MissionOverlay | null = null
  let groundHeight = 0
  let entities: Entity[] = []

  const add = (options: Entity.ConstructorOptions) => {
    const entity = viewer.entities.add(options)
    entities.push(entity)
    return entity
  }

  function clear() {
    entities.forEach((entity) => viewer.entities.remove(entity))
    entities = []
  }

  function render() {
    clear()
    if (!overlay) return
    const { phase, area, routes } = overlay
    const accent = palette.selected
    const muted = palette.standby
    const draft = phase === 'draft'
    const lineColor = phase === 'completed' ? muted : accent
    const dashed = (color: typeof accent): MaterialProperty =>
      new PolylineDashMaterialProperty({ color, dashLength: 12 })

    const ring = area.map((p) => Cartesian3.fromDegrees(p.longitude, p.latitude))
    if (area.length >= 3) {
      add({
        polygon: {
          hierarchy: new PolygonHierarchy(ring),
          material: new ColorMaterialProperty(lineColor.withAlpha(draft ? 0.08 : 0.12)),
          classificationType: ClassificationType.BOTH,
        },
      })
    }
    if (area.length >= 2) {
      add({
        polyline: {
          positions: area.length >= 3 ? [...ring, ring[0] ?? Cartesian3.ZERO] : ring,
          width: 2,
          clampToGround: true,
          material: draft
            ? dashed(lineColor.withAlpha(0.9))
            : new ColorMaterialProperty(lineColor.withAlpha(0.8)),
        },
      })
    }
    if (draft) {
      for (const point of area) {
        add({
          position: Cartesian3.fromDegrees(point.longitude, point.latitude),
          point: {
            pixelSize: 8,
            color: palette.halo,
            outlineColor: accent,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      }
    }

    for (const route of routes) {
      // Static geometry: rebuilt only when the overlay or ground height changes, never per frame.
      const positions = route.waypoints.map((w) =>
        Cartesian3.fromDegrees(w.longitude, w.latitude, groundHeight + w.altitude),
      )
      add({
        polyline: {
          positions,
          width: 1.5,
          material:
            phase === 'planned'
              ? dashed(accent.withAlpha(0.85))
              : new ColorMaterialProperty(lineColor.withAlpha(phase === 'active' ? 0.25 : 0.2)),
        },
      })
      if (phase === 'completed') continue
      for (const waypoint of route.waypoints) {
        add({
          position: Cartesian3.fromDegrees(
            waypoint.longitude,
            waypoint.latitude,
            groundHeight + waypoint.altitude,
          ),
          point: { pixelSize: 4, color: accent.withAlpha(phase === 'planned' ? 0.9 : 0.5) },
        })
      }
    }
  }

  return {
    set(next) {
      overlay = next
      render()
    },
    setPalette(next) {
      palette = next
      render()
    },
    setGroundHeight(meters) {
      if (meters === groundHeight) return
      groundHeight = meters
      render()
    },
    destroy: clear,
  }
}

import type { GeoPoint } from '@horizon/domain'
import {
  Cartesian3,
  ClassificationType,
  ColorMaterialProperty,
  DistanceDisplayCondition,
  HeightReference,
  PolygonHierarchy,
  type Entity,
  type Viewer,
} from 'cesium'
import { getLabelPill } from './marker-images'
import type { MapPalette } from './palette'

/** No-fly zone to display; `highlighted` marks the zone that blocked a plan or holds a UAV. */
export interface GeofenceOverlay {
  id: string
  name: string
  polygon: GeoPoint[]
  highlighted: boolean
}

export interface GeofenceLayer {
  set(zones: readonly GeofenceOverlay[]): void
  setPalette(palette: MapPalette): void
  destroy(): void
}

/** Zone names are context, not clutter: hidden when zoomed out over the whole region. */
const LABEL_DISTANCE = new DistanceDisplayCondition(0, 12_000)

/** Renders restricted airspace on the ground; rebuilt on change (zones change rarely). */
export function createGeofenceLayer(viewer: Viewer, initialPalette: MapPalette): GeofenceLayer {
  let palette = initialPalette
  let zones: readonly GeofenceOverlay[] = []
  let entities: Entity[] = []

  const add = (options: Entity.ConstructorOptions) => {
    entities.push(viewer.entities.add(options))
  }

  function clear() {
    entities.forEach((entity) => viewer.entities.remove(entity))
    entities = []
  }

  function render() {
    clear()
    const color = palette.danger
    for (const zone of zones) {
      if (zone.polygon.length < 3) continue
      const ring = zone.polygon.map((p) => Cartesian3.fromDegrees(p.longitude, p.latitude))
      add({
        polygon: {
          hierarchy: new PolygonHierarchy(ring),
          material: new ColorMaterialProperty(color.withAlpha(zone.highlighted ? 0.3 : 0.1)),
          classificationType: ClassificationType.BOTH,
        },
      })
      add({
        polyline: {
          positions: [...ring, ring[0] ?? Cartesian3.ZERO],
          width: zone.highlighted ? 3 : 1.5,
          clampToGround: true,
          material: new ColorMaterialProperty(color.withAlpha(zone.highlighted ? 1 : 0.7)),
        },
      })
      const center = {
        latitude: zone.polygon.reduce((sum, p) => sum + p.latitude, 0) / zone.polygon.length,
        longitude: zone.polygon.reduce((sum, p) => sum + p.longitude, 0) / zone.polygon.length,
      }
      const pill = getLabelPill(`No-fly · ${zone.name}`, {
        surface: palette.surfaceRaised,
        text: color,
        shadow: palette.shadow,
      })
      add({
        position: Cartesian3.fromDegrees(center.longitude, center.latitude),
        billboard: {
          image: pill.image,
          width: pill.width,
          height: pill.height,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          distanceDisplayCondition: LABEL_DISTANCE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    }
  }

  return {
    set(next) {
      zones = next
      render()
    },
    setPalette(next) {
      palette = next
      render()
    },
    destroy: clear,
  }
}

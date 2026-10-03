import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRange,
  type Viewer,
} from 'cesium'
import type { UavLayer } from './uav-layer'

/** Center of the operating area: between the stadium base and the demo mission area. */
export const OPERATING_SITE = { latitude: 24.46, longitude: 54.3795 }

/** Map and Satellite look straight down (2D-like); the 3D view tilts the camera. */
const TOP_DOWN_PITCH = CesiumMath.toRadians(-89.9)
const TILTED_PITCH = CesiumMath.toRadians(-42)
const HOME_RANGE_METERS = 6_000
const FOCUS_RANGE_METERS = 900
const FLIGHT_SECONDS = 1.2

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface CameraController {
  home(animate: boolean): void
  /** Switches between top-down and tilted perspective around the point at the screen center. */
  setTilted(tilted: boolean): void
  focusUav(uavId: string): void
  /** Zooms to a group of UAVs (e.g. a clicked cluster). */
  focusArea(sphere: BoundingSphere): void
  /** Explicit Follow mode; null stops following and leaves the camera where it is. */
  follow(uavId: string | null): void
}

export function createCameraController(
  viewer: Viewer,
  layer: UavLayer,
  initiallyTilted: boolean,
): CameraController {
  const { camera, scene } = viewer
  let tilted = initiallyTilted
  const duration = () => (prefersReducedMotion() ? 0 : FLIGHT_SECONDS)
  const pitch = () => (tilted ? TILTED_PITCH : TOP_DOWN_PITCH)

  function flyAround(target: Cartesian3, range: number, animate = true) {
    camera.flyToBoundingSphere(new BoundingSphere(target, 0), {
      offset: new HeadingPitchRange(tilted ? camera.heading : 0, pitch(), range),
      duration: animate ? duration() : 0,
    })
  }

  /** Ground point under the screen center, if the view looks at the globe. */
  function screenCenterTarget(): Cartesian3 | undefined {
    const canvas = scene.canvas
    return camera.pickEllipsoid(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2))
  }

  const site = Cartesian3.fromDegrees(OPERATING_SITE.longitude, OPERATING_SITE.latitude)

  return {
    home(animate) {
      viewer.trackedEntity = undefined
      flyAround(site, HOME_RANGE_METERS, animate)
    },

    setTilted(next) {
      if (next === tilted) return
      tilted = next
      viewer.trackedEntity = undefined
      const target = screenCenterTarget()
      if (!target) {
        flyAround(site, HOME_RANGE_METERS)
        return
      }
      flyAround(target, Cartesian3.distance(camera.positionWC, target))
    },

    focusUav(uavId) {
      const position = layer.positionOf(uavId)
      if (position) flyAround(position, FOCUS_RANGE_METERS)
    },

    focusArea(sphere) {
      viewer.trackedEntity = undefined
      flyAround(sphere.center, Math.max(sphere.radius * 6, FOCUS_RANGE_METERS / 2))
    },

    follow(uavId) {
      const entity = uavId ? layer.getEntity(uavId) : undefined
      if (entity) entity.viewFrom = new Cartesian3(0, -700, 450)
      viewer.trackedEntity = entity
    },
  }
}

import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  HeadingPitchRange,
  type Viewer,
} from 'cesium'
import type { GeoPoint } from '@horizon/domain'
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
  /** Geographic point under a screen position (on the ellipsoid), if any. */
  groundPointAt(position: Cartesian2): GeoPoint | null
}

/** Follow offsets in the UAV's local frame: behind and above in 3D, straight down in 2D. */
const FOLLOW_OFFSET_TILTED = new Cartesian3(0, -700, 450)
const FOLLOW_OFFSET_TOP_DOWN = new Cartesian3(0, -1, 900)

export function createCameraController(
  viewer: Viewer,
  layer: UavLayer,
  initiallyTilted: boolean,
  /** The camera stopped following on its own (e.g. zooming into a cluster); state must follow. */
  onFollowStopped: () => void = () => undefined,
): CameraController {
  const { camera, scene } = viewer
  let tilted = initiallyTilted
  /** UAV the camera tracks; the single source for whether following is on. */
  let followedId: string | null = null

  /** (Re)attaches tracking with the offset for the current perspective. */
  function track(uavId: string | null) {
    followedId = uavId
    const entity = uavId ? layer.getEntity(uavId) : undefined
    if (entity) entity.viewFrom = tilted ? FOLLOW_OFFSET_TILTED : FOLLOW_OFFSET_TOP_DOWN
    viewer.trackedEntity = undefined
    viewer.trackedEntity = entity
  }
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
      followedId = null
      viewer.trackedEntity = undefined
      flyAround(site, HOME_RANGE_METERS, animate)
    },

    setTilted(next) {
      if (next === tilted) return
      tilted = next
      // Following survives the perspective switch, with the matching view.
      if (followedId) {
        track(followedId)
        return
      }
      viewer.trackedEntity = undefined
      const target = screenCenterTarget()
      if (!target) {
        flyAround(site, HOME_RANGE_METERS)
        return
      }
      flyAround(target, Cartesian3.distance(camera.positionWC, target))
    },

    focusUav(uavId) {
      // Centering the followed UAV snaps the follow view back instead of fighting it.
      if (uavId === followedId) {
        track(uavId)
        return
      }
      const position = layer.positionOf(uavId)
      if (position) flyAround(position, FOCUS_RANGE_METERS)
    },

    focusArea(sphere) {
      viewer.trackedEntity = undefined
      if (followedId) {
        followedId = null
        onFollowStopped()
      }
      flyAround(sphere.center, Math.max(sphere.radius * 6, FOCUS_RANGE_METERS / 2))
    },

    groundPointAt(position) {
      const cartesian = camera.pickEllipsoid(position)
      if (!cartesian) return null
      const { latitude, longitude } = Cartographic.fromCartesian(cartesian)
      return {
        latitude: CesiumMath.toDegrees(latitude),
        longitude: CesiumMath.toDegrees(longitude),
      }
    },

    follow(uavId) {
      track(uavId)
    },
  }
}

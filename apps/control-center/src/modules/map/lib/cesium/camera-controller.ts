import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  Transforms,
  type Viewer,
} from 'cesium'
import type { GeoPoint } from '@horizon/domain'
import type { ViewportInsets } from '../../model/map.store'
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
  /** Panels covering the map: framing centers targets in the remaining free area. */
  setInsets(insets: ViewportInsets): void
}

/** Follow distance; the user can zoom and orbit while following, which is kept. */
const FOLLOW_RANGE_METERS = 850

const NO_INSETS: ViewportInsets = { top: 0, right: 0, bottom: 0, left: 0 }

export function createCameraController(
  viewer: Viewer,
  layer: UavLayer,
  initiallyTilted: boolean,
  /** The camera stopped following on its own (e.g. zooming into a cluster); state must follow. */
  onFollowStopped: () => void = () => undefined,
): CameraController {
  const { camera, scene } = viewer
  let tilted = initiallyTilted
  let insets = NO_INSETS
  const duration = () => (prefersReducedMotion() ? 0 : FLIGHT_SECONDS)
  const pitch = () => (tilted ? TILTED_PITCH : TOP_DOWN_PITCH)

  /**
   * Point the camera must look at so `target` appears in the middle of the free map area (the
   * part not covered by panels) rather than the middle of the canvas. Only the look-at point
   * moves; the projection stays centered, so picking (clicks, drawing) stays exact.
   */
  function framed(target: Cartesian3, range: number, heading: number, viewPitch: number) {
    const dx = (insets.left - insets.right) / 2
    const dy = (insets.top - insets.bottom) / 2
    if (dx === 0 && dy === 0) return target
    const height = scene.canvas.clientHeight || 1
    const fovy =
      (camera.frustum instanceof PerspectiveFrustum ? camera.frustum.fovy : undefined) ??
      Math.PI / 3
    const metersPerPixel = (2 * range * Math.tan(fovy / 2)) / height
    // Screen right/up as ground directions for this heading; tilt stretches the vertical.
    const right = -dx * metersPerPixel
    const up = (dy * metersPerPixel) / Math.max(0.3, Math.abs(Math.sin(viewPitch)))
    const east = Math.cos(heading) * right + Math.sin(heading) * up
    const north = -Math.sin(heading) * right + Math.cos(heading) * up
    const frame = Transforms.eastNorthUpToFixedFrame(target)
    return Matrix4.multiplyByPoint(frame, new Cartesian3(east, north, 0), new Cartesian3())
  }

  function flyAround(target: Cartesian3, range: number, animate = true, onComplete?: () => void) {
    const heading = tilted ? camera.heading : 0
    camera.flyToBoundingSphere(new BoundingSphere(framed(target, range, heading, pitch()), 0), {
      offset: new HeadingPitchRange(heading, pitch(), range),
      duration: animate ? duration() : 0,
      complete: onComplete,
    })
  }

  /** Ground point in the middle of the free map area, if the view looks at the globe. */
  function freeCenterTarget(): Cartesian3 | undefined {
    const { clientWidth, clientHeight } = scene.canvas
    return camera.pickEllipsoid(
      new Cartesian2(
        (insets.left + clientWidth - insets.right) / 2,
        (insets.top + clientHeight - insets.bottom) / 2,
      ),
    )
  }

  /*
   * Follow: the camera orbits a look-at point re-framed every frame around the UAV, so the UAV
   * stays in the middle of the free area. Zoom and orbit by the user are read back each frame
   * and kept. `followedId` is the single source for whether following is on.
   */
  let followedId: string | null = null
  /** Waiting for the fly-in to finish before the per-frame follow takes over. */
  let followArmed = false
  const followView = { heading: 0, pitch: TOP_DOWN_PITCH, range: FOLLOW_RANGE_METERS }

  function release() {
    followArmed = false
    camera.lookAtTransform(Matrix4.IDENTITY)
  }

  function startFollow(uavId: string) {
    release()
    followedId = uavId
    const position = layer.positionOf(uavId)
    followView.heading = tilted ? camera.heading : 0
    followView.pitch = pitch()
    followView.range = FOLLOW_RANGE_METERS
    if (!position) {
      followArmed = true
      return
    }
    flyAround(position, FOLLOW_RANGE_METERS, true, () => {
      if (followedId === uavId) followArmed = true
    })
  }

  scene.preRender.addEventListener(() => {
    if (!followedId || !followArmed) return
    const position = layer.positionOf(followedId)
    if (!position) return
    // Read back what the user did since the last frame (zoom, orbit) while locked on.
    if (!Matrix4.equals(camera.transform, Matrix4.IDENTITY)) {
      followView.heading = camera.heading
      followView.pitch = camera.pitch
      followView.range = Cartesian3.magnitude(camera.position)
    }
    const { heading, pitch: viewPitch, range } = followView
    camera.lookAt(
      framed(position, range, heading, viewPitch),
      new HeadingPitchRange(heading, viewPitch, range),
    )
  })

  const site = Cartesian3.fromDegrees(OPERATING_SITE.longitude, OPERATING_SITE.latitude)

  return {
    home(animate) {
      followedId = null
      release()
      flyAround(site, HOME_RANGE_METERS, animate)
    },

    setTilted(next) {
      if (next === tilted) return
      tilted = next
      // Following survives the perspective switch, with the matching view.
      if (followedId) {
        startFollow(followedId)
        return
      }
      const target = freeCenterTarget()
      if (!target) {
        flyAround(site, HOME_RANGE_METERS)
        return
      }
      flyAround(target, Cartesian3.distance(camera.positionWC, target))
    },

    focusUav(uavId) {
      // Centering the followed UAV snaps the follow view back instead of fighting it.
      if (uavId === followedId) {
        startFollow(uavId)
        return
      }
      const position = layer.positionOf(uavId)
      if (position) flyAround(position, FOCUS_RANGE_METERS)
    },

    focusArea(sphere) {
      release()
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
      if (uavId === null) {
        followedId = null
        release()
        return
      }
      startFollow(uavId)
    },

    setInsets(next) {
      insets = next
    },
  }
}

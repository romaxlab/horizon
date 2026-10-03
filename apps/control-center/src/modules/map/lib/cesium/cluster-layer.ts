import type { UavStatus } from '@horizon/domain'
import {
  BoundingSphere,
  CallbackPositionProperty,
  Cartesian3,
  ConstantProperty,
  HorizontalOrigin,
  SceneTransforms,
  VerticalOrigin,
  type Color,
  type Entity,
  type Viewer,
} from 'cesium'
import { clusterScreenPoints } from '../declutter'
import { clusterBadgeSize, getClusterBadge } from './marker-images'
import type { MapPalette } from './palette'
import type { UavLayer } from './uav-layer'

/**
 * UAVs closer to the camera than this are always shown individually (e.g. the parking grid).
 * Beyond it, markers closer on screen than the threshold aggregate; as the camera zooms in the
 * screen gaps grow and clusters split gradually along natural gaps.
 */
const NEAR_DISTANCE_METERS = 1_200
/** Minimum on-screen spacing between any two badges/markers; larger than the biggest badge. */
const CLUSTER_THRESHOLD_PX = 44
/** Standby UAVs at the base aggregate or split as one parking formation. */
const FORMATION_GROUP = 'standby-formation'
const MIN_CLUSTER_SIZE = 2
const RECLUSTER_INTERVAL_MS = 150
const ENTITY_PREFIX = 'cluster:'

interface Slot {
  entity: Entity
  memberIds: string[]
}

export interface ClusterLayer {
  /** Member UAV ids when the pick hit a cluster badge. */
  membersFromPick(picked: unknown): string[] | null
  boundingSphereOf(memberIds: readonly string[]): BoundingSphere | null
  setPalette(palette: MapPalette): void
  destroy(): void
}

/**
 * Distance-based decluttering: when UAV markers would overlap on screen they collapse into a
 * counted badge. Membership is recomputed a few times per second; badge positions follow their
 * members every frame. The selected UAV is never clustered.
 */
export function createClusterLayer(
  viewer: Viewer,
  uavs: UavLayer,
  initialPalette: MapPalette,
): ClusterLayer {
  const { scene } = viewer
  let palette = initialPalette
  const slots: Slot[] = []
  let membership = new Map<string, string>()
  let statuses = new Map<string, UavStatus>()
  let lastRun = 0
  let clusteredIds: ReadonlySet<string> = new Set()

  /** Badges stay neutral; only problems inside a cluster earn a colored ring. */
  function alertColor(memberIds: readonly string[]): Color | undefined {
    const present = new Set(memberIds.map((id) => statuses.get(id)))
    if (present.has('offline')) return palette.danger
    if (present.has('warning') || present.has('stale')) return palette.warning
    return undefined
  }

  function centerOf(memberIds: readonly string[]): Cartesian3 | undefined {
    const positions = memberIds.flatMap((id) => uavs.positionOf(id) ?? [])
    if (positions.length === 0) return undefined
    const sum = positions.reduce((acc, p) => Cartesian3.add(acc, p, acc), new Cartesian3())
    return Cartesian3.divideByScalar(sum, positions.length, sum)
  }

  function slotAt(index: number): Slot {
    const existing = slots[index]
    if (existing) return existing
    const members: Pick<Slot, 'memberIds'> = { memberIds: [] }
    const entity = viewer.entities.add({
      id: `${ENTITY_PREFIX}${index}`,
      show: false,
      position: new CallbackPositionProperty(() => centerOf(members.memberIds), false),
      billboard: {
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    const slot: Slot = Object.assign(members, { entity })
    slots[index] = slot
    return slot
  }

  function styleSlot(slot: Slot) {
    const billboard = slot.entity.billboard
    if (!billboard) return
    const count = slot.memberIds.length
    const size = clusterBadgeSize(count)
    billboard.image = new ConstantProperty(
      getClusterBadge(count, {
        surface: palette.surface,
        text: palette.textPrimary,
        halo: palette.halo,
        shadow: palette.shadow,
        alert: alertColor(slot.memberIds),
      }),
    )
    billboard.width = new ConstantProperty(size)
    billboard.height = new ConstantProperty(size)
  }

  function recluster() {
    const markers = uavs.clusterableMarkers()
    statuses = new Map(markers.map((m) => [m.id, m.status]))
    const cameraPosition = scene.camera.positionWC
    const projected = markers.flatMap(({ id, status, position }) => {
      const screen = SceneTransforms.worldToWindowCoordinates(scene, position)
      const distance = Cartesian3.distance(cameraPosition, position)
      return screen ? [{ id, status, distance, x: screen.x, y: screen.y }] : []
    })

    // The parking formation is judged as a whole: if any neighbours would crowd each other it
    // aggregates into one badge, otherwise every UAV shows individually.
    const formation = projected.filter((p) => p.status === 'standby')
    const crowded = formation.some((a, i) =>
      formation.some(
        (b, j) => j > i && Math.hypot(a.x - b.x, a.y - b.y) < CLUSTER_THRESHOLD_PX * 0.75,
      ),
    )
    const formationDistance =
      formation.reduce((sum, p) => sum + p.distance, 0) / Math.max(formation.length, 1)
    const groupFormation = crowded && formationDistance >= NEAR_DISTANCE_METERS

    const points = projected.flatMap(({ id, status, distance, x, y }) => {
      if (status === 'standby') {
        return groupFormation ? [{ id, x, y, group: FORMATION_GROUP }] : []
      }
      return distance < NEAR_DISTANCE_METERS ? [] : [{ id, x, y }]
    })

    const clusters = clusterScreenPoints(points, CLUSTER_THRESHOLD_PX, membership).filter(
      (cluster) => cluster.memberIds.length >= MIN_CLUSTER_SIZE,
    )

    membership = new Map(clusters.flatMap((c) => c.memberIds.map((id) => [id, c.key] as const)))
    const nextClustered = new Set(membership.keys())
    const changed =
      nextClustered.size !== clusteredIds.size ||
      [...nextClustered].some((id) => !clusteredIds.has(id))
    clusteredIds = nextClustered
    uavs.setClustered(nextClustered)
    // On-demand rendering: show the new grouping (only when it actually changed).
    if (changed) scene.requestRender()

    clusters.forEach((cluster, index) => {
      const slot = slotAt(index)
      const changed =
        slot.memberIds.join() !== cluster.memberIds.join() ||
        alertColor(slot.memberIds) !== alertColor(cluster.memberIds)
      slot.memberIds = cluster.memberIds
      slot.entity.show = true
      if (changed) styleSlot(slot)
    })
    for (let i = clusters.length; i < slots.length; i++) {
      const slot = slots[i]
      if (slot) {
        slot.entity.show = false
        slot.memberIds = []
      }
    }
  }

  const removeListener = scene.postRender.addEventListener(() => {
    const now = performance.now()
    if (now - lastRun < RECLUSTER_INTERVAL_MS) return
    lastRun = now
    recluster()
  })

  // The throttle may skip the last frames of a camera move; settle clusters once it stops.
  const removeMoveEnd = scene.camera.moveEnd.addEventListener(() => {
    lastRun = performance.now()
    recluster()
  })

  return {
    membersFromPick(picked) {
      const id = (picked as { id?: { id?: unknown } } | undefined)?.id?.id
      if (typeof id !== 'string' || !id.startsWith(ENTITY_PREFIX)) return null
      const slot = slots[Number(id.slice(ENTITY_PREFIX.length))]
      return slot && slot.memberIds.length > 0 ? [...slot.memberIds] : null
    },

    boundingSphereOf(memberIds) {
      const positions = memberIds.flatMap((id) => uavs.positionOf(id) ?? [])
      return positions.length > 0 ? BoundingSphere.fromPoints(positions) : null
    },

    setPalette(next) {
      palette = next
      slots.forEach(styleSlot)
    },

    destroy() {
      removeListener()
      removeMoveEnd()
      slots.forEach((slot) => viewer.entities.remove(slot.entity))
      slots.length = 0
      uavs.setClustered(new Set())
    },
  }
}

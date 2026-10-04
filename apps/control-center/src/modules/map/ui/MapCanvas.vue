<script setup lang="ts">
import type { GeoPoint } from '@horizon/domain'
import type { FleetFeed } from '../model/fleet-feed'
import { BaseText, useTheme } from '@horizon/ui'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { appConfig } from '@/shared/config'
import type { MapScene } from '../lib/cesium/map-scene'
import type { GeofenceOverlay } from '../lib/cesium/geofence-layer'
import type { MissionOverlay } from '../lib/cesium/mission-layer'
import { basemapCredit, MAP_ATTRIBUTION_TARGET_ID } from '../lib/basemap-credits'
import { useMapStore } from '../model/map.store'

const props = defineProps<{
  /** Live fleet stream; the map applies deltas without component re-renders. */
  fleet: FleetFeed
  selectedUavId: string | null
  missionOverlay: MissionOverlay | null
  geofences: readonly GeofenceOverlay[]
  /** Clicks add mission area points instead of selecting UAVs. */
  drawing: boolean
}>()

const emit = defineEmits<{ select: [uavId: string | null]; draw: [point: GeoPoint] }>()

const container = ref<HTMLElement>()
const credits = ref<HTMLElement>()
const scene = shallowRef<MapScene>()
const failed = ref(false)

const { theme } = useTheme()
const map = useMapStore()
const {
  followUavId,
  focusRequest,
  homeRequest,
  basemap,
  perspective,
  viewportInsets,
  arrival,
  contentHidden,
} = storeToRefs(map)
const ionToken = appConfig.cesiumIonToken
/** Satellite imagery comes from Cesium ion until it fails; then the scene falls back to Esri. */
const ionImagery = ref(ionToken !== null)
const esriCredit = computed(() => basemapCredit(basemap.value, ionImagery.value))

let unsubscribeFleet: (() => void) | null = null

onMounted(async () => {
  try {
    // Cesium is loaded on demand so the shell renders before the 3D engine.
    const { createMapScene } = await import('../lib/cesium/map-scene')
    if (!container.value || !credits.value) return
    scene.value = createMapScene({
      container: container.value,
      creditContainer: credits.value,
      theme: theme.value,
      basemap: basemap.value,
      perspective: perspective.value,
      ionToken,
      onIonImageryUnavailable: () => {
        ionImagery.value = false
      },
      onSelect: (uavId) => {
        emit('select', uavId)
      },
      onDraw: (point) => {
        emit('draw', point)
      },
      onFollowStopped: () => {
        map.setFollow(null)
      },
      viewportInsets: viewportInsets.value,
      startInOrbit: arrival.value.stage !== 'settled',
    })
    const created = scene.value
    created.sync(props.fleet.current())
    created.select(props.selectedUavId)
    unsubscribeFleet = props.fleet.subscribe((change) => {
      if (change.kind === 'reset') created.sync(props.fleet.current())
      else created.update(change.changed)
    })
    scene.value.setMissionOverlay(props.missionOverlay)
    scene.value.setGeofences(props.geofences)
    scene.value.setDrawing(props.drawing)
    // The arrival may have moved on while Cesium loaded: catch up with it.
    applyArrival(arrival.value)
    scene.value.setContentVisible(!contentHidden.value)
    map.setSceneReady(true)
  } catch (error) {
    console.error('[map] failed to initialize', error)
    failed.value = true
  }
})

onBeforeUnmount(() => {
  map.setSceneReady(false)
  unsubscribeFleet?.()
  scene.value?.destroy()
})

watch(
  () => props.selectedUavId,
  (selectedUavId) => {
    scene.value?.select(selectedUavId)
  },
)
watch(
  () => props.missionOverlay,
  (overlay) => {
    scene.value?.setMissionOverlay(overlay)
  },
)
watch(
  () => props.geofences,
  (zones) => {
    scene.value?.setGeofences(zones)
  },
)
watch(
  () => props.drawing,
  (drawing) => {
    scene.value?.setDrawing(drawing)
  },
)
watch(theme, (next) => {
  scene.value?.setTheme(next)
})
watch([viewportInsets, scene], ([insets]) => {
  scene.value?.setViewportInsets(insets)
})
watch([followUavId, scene], ([uavId]) => {
  scene.value?.follow(uavId)
})
watch(focusRequest, (request) => {
  if (request) scene.value?.focusUav(request.uavId)
})
watch(basemap, (next) => {
  scene.value?.setBasemap(next)
})
watch(perspective, (next) => {
  scene.value?.setPerspective(next)
})
/** Opening arrival: fly in from orbit, or jump straight home when it is cut short. */
function applyArrival(next: typeof arrival.value) {
  if (next.stage === 'flying') scene.value?.arrive(next.durationMs)
  else if (next.stage === 'settled' && next.cut) scene.value?.arrive(0)
}
watch(arrival, applyArrival)
watch(contentHidden, (hidden) => {
  scene.value?.setContentVisible(!hidden)
})
watch(homeRequest, () => {
  scene.value?.home()
})
</script>

<template>
  <div class="absolute inset-0">
    <!-- data-map-ready: the 3D scene is interactive (also a stable hook for E2E). -->
    <div ref="container" class="absolute inset-0" :data-map-ready="scene !== undefined" />
    <div v-if="failed" class="absolute inset-0 grid place-items-center">
      <BaseText variant="body-md" tone="muted">3D map is unavailable</BaseText>
    </div>
    <!-- Attribution joins the map controls (bottom right), so it never collides with the bottom
         bar; glass keeps it legible over satellite imagery. -->
    <Teleport defer :to="`#${MAP_ATTRIBUTION_TARGET_ID}`">
      <!-- Basemap credit for the selected basemap only (no doubling during the cross-fade);
           Cesium's container adds ion credits (imagery, terrain, buildings, Google tiles). -->
      <div
        class="map-attribution text-right text-micro whitespace-nowrap text-text-secondary max-sm:w-64 max-sm:whitespace-normal"
        aria-label="Map data attribution"
      >
        <template v-if="esriCredit">Powered by Esri · {{ esriCredit }}</template>
        <div ref="credits" class="map-credits inline" :class="{ 'without-ion': !ionToken }" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Plain fine print over the map; a halo in the canvas color keeps it legible on imagery. */
.map-attribution {
  text-shadow:
    0 0 1px var(--bg-canvas),
    0 0 2px var(--bg-canvas),
    0 0 4px var(--bg-canvas);
}
/* Cesium renders attribution markup itself; flatten its widget styles onto our tokens. */
.map-credits :deep(.cesium-widget-credits) {
  display: inline;
  position: static;
  padding: 0;
  color: inherit;
  font-size: inherit;
  text-shadow: inherit;
}
/* The Cesium ion logo is required whenever ion is used; hide it only when ion is off. */
.map-credits.without-ion :deep(.cesium-credit-logoContainer) {
  display: none !important;
}
.map-credits :deep(.cesium-credit-logoContainer img) {
  height: 1rem;
  vertical-align: middle !important;
}
</style>

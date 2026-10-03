<script setup lang="ts">
import type { GeoPoint } from '@horizon/domain'
import type { FleetFeed } from '../model/fleet-feed'
import { BaseSurface, BaseText, useTheme } from '@horizon/ui'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { appConfig } from '@/shared/config'
import type { MapScene } from '../lib/cesium/map-scene'
import type { GeofenceOverlay } from '../lib/cesium/geofence-layer'
import type { MissionOverlay } from '../lib/cesium/mission-layer'
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
const { followUavId, focusRequest, homeRequest, basemap, perspective } = storeToRefs(map)
const ionToken = appConfig.cesiumIonToken

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
      onSelect: (uavId) => {
        emit('select', uavId)
      },
      onDraw: (point) => {
        emit('draw', point)
      },
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
  } catch (error) {
    console.error('[map] failed to initialize', error)
    failed.value = true
  }
})

onBeforeUnmount(() => {
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
    <!-- Attribution sits on glass so it stays legible over satellite imagery. -->
    <BaseSurface
      variant="floating"
      shape="pill"
      class="absolute right-3 bottom-1.5 px-2 py-0.5 text-caption whitespace-nowrap text-text-muted"
    >
      <div ref="credits" class="map-credits" :class="{ 'without-ion': !ionToken }" />
    </BaseSurface>
  </div>
</template>

<style scoped>
/* Cesium renders attribution markup itself; flatten its widget styles onto our tokens. */
.map-credits :deep(.cesium-widget-credits) {
  position: static;
  padding: 0;
  color: inherit;
  font-size: inherit;
  text-shadow: none;
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

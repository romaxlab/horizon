<script setup lang="ts">
import type { GeoPoint } from '@horizon/domain'
import type { FleetFeed } from '../model/fleet-feed'
import { BaseSpinner, BaseSurface, BaseText, useTheme } from '@horizon/ui'
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
/** The map appears once its first view is complete, instead of building up in steps. */
const firstViewShown = ref(false)
/** Fast loads never flash a loader: it appears only if the map takes longer than this. */
const LOADER_DELAY_MS = 400
const loaderShown = ref(false)
const loaderTimer = setTimeout(() => {
  loaderShown.value = true
}, LOADER_DELAY_MS)
/** The loader sits in the middle of the map area the panels leave free. */
const freeAreaStyle = computed(() => {
  const { top, right, bottom, left } = viewportInsets.value
  return { inset: `${String(top)}px ${String(right)}px ${String(bottom)}px ${String(left)}px` }
})

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
/** Async scene callbacks may land after unmount; they must not touch shared state then. */
let disposed = false

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
    void created.whenFirstViewReady().then(() => {
      if (disposed) return
      firstViewShown.value = true
      map.setSceneReady(true)
    })
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
  } catch (error) {
    console.error('[map] failed to initialize', error)
    failed.value = true
  }
})

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(loaderTimer)
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
    <!-- Stands in for the map until its first view is complete, then fades away with its loader.
         The WebGL canvas itself stays visible: hiding it stalls the main thread when shown. -->
    <Transition
      leave-active-class="transition-opacity duration-500 ease-out motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <div
        v-if="!firstViewShown && !failed"
        class="map-placeholder pointer-events-none absolute inset-0 bg-map-placeholder"
      >
        <div class="absolute grid place-items-center" :style="freeAreaStyle">
          <Transition
            enter-active-class="transition-opacity duration-300 ease-out"
            enter-from-class="opacity-0"
          >
            <BaseSurface
              v-if="loaderShown"
              variant="floating"
              shape="pill"
              class="flex items-center gap-2 py-2 pr-4 pl-3"
              role="status"
            >
              <BaseSpinner label="Loading map" class="text-text-secondary" />
              <BaseText variant="label-md" tone="secondary">Loading map</BaseText>
            </BaseSurface>
          </Transition>
        </div>
      </div>
    </Transition>
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
/* A faint graticule on the basemap tone: reads as "a map goes here", not as an empty screen. */
.map-placeholder {
  background-image:
    linear-gradient(var(--map-placeholder-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--map-placeholder-grid) 1px, transparent 1px);
  background-position: center;
  background-size: 48px 48px;
}
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

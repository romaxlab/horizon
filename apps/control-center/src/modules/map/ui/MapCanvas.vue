<script setup lang="ts">
import type { UavState } from '@horizon/domain'
import { BaseSurface, BaseText, useTheme } from '@horizon/ui'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { appConfig } from '@/shared/config'
import type { MapScene } from '../lib/cesium/map-scene'
import { useMapStore } from '../model/map.store'

const props = defineProps<{
  uavs: readonly UavState[]
  selectedUavId: string | null
}>()

const emit = defineEmits<{ select: [uavId: string | null] }>()

const container = ref<HTMLElement>()
const credits = ref<HTMLElement>()
const scene = shallowRef<MapScene>()
const failed = ref(false)

const { theme } = useTheme()
const map = useMapStore()
const { followUavId, focusRequest, homeRequest, basemap, perspective } = storeToRefs(map)
const ionToken = appConfig.cesiumIonToken

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
    })
    scene.value.sync(props.uavs, props.selectedUavId)
  } catch (error) {
    console.error('[map] failed to initialize', error)
    failed.value = true
  }
})

onBeforeUnmount(() => {
  scene.value?.destroy()
})

watch(
  () => [props.uavs, props.selectedUavId] as const,
  ([uavs, selectedUavId]) => {
    scene.value?.sync(uavs, selectedUavId)
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
    <div ref="container" class="absolute inset-0" />
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

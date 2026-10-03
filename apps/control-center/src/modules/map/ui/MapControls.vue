<script setup lang="ts">
import { Locate, Navigation } from '@lucide/vue'
import {
  BaseIconButton,
  BaseSegmentedControl,
  BaseSurface,
  BaseText,
  type SegmentOption,
} from '@horizon/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useMapStore, type MapBasemap } from '../model/map.store'

const props = defineProps<{ selectedUavId: string | null }>()

const map = useMapStore()
const { followUavId, basemap, perspective } = storeToRefs(map)
const following = computed(() => followUavId.value !== null)

const basemapOptions: SegmentOption<MapBasemap>[] = [
  { value: 'map', label: 'Map' },
  { value: 'satellite', label: 'Satellite' },
]

const selectedBasemap = computed({
  get: () => basemap.value,
  set: (next: MapBasemap) => {
    map.setBasemap(next)
  },
})

function togglePerspective() {
  map.setPerspective(perspective.value === '3d' ? '2d' : '3d')
}

function toggleFollow() {
  map.setFollow(following.value ? null : props.selectedUavId)
}
</script>

<template>
  <div class="flex flex-col items-end gap-2">
    <!-- Shows the perspective it switches to, like Apple Maps. -->
    <BaseSurface variant="floating" shape="pill" class="p-1">
      <BaseIconButton
        :label="perspective === '3d' ? 'Switch to 2D view' : 'Switch to 3D view'"
        @click="togglePerspective"
      >
        <BaseText variant="label-md" tone="inherit">{{
          perspective === '3d' ? '2D' : '3D'
        }}</BaseText>
      </BaseIconButton>
    </BaseSurface>
    <BaseSurface variant="floating" shape="pill" class="flex flex-col gap-0.5 p-1">
      <BaseIconButton
        :label="following ? 'Stop following' : 'Follow selected UAV'"
        :pressed="following"
        :disabled="!selectedUavId && !following"
        @click="toggleFollow"
      >
        <Navigation />
      </BaseIconButton>
      <BaseIconButton label="Reset view" @click="map.resetView()">
        <Locate />
      </BaseIconButton>
    </BaseSurface>
    <BaseSurface variant="floating" shape="pill" class="p-1">
      <BaseSegmentedControl
        v-model="selectedBasemap"
        label="Map imagery"
        :options="basemapOptions"
      />
    </BaseSurface>
  </div>
</template>

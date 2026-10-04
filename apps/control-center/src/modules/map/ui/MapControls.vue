<script setup lang="ts">
import { House } from '@lucide/vue'
import {
  BaseIconButton,
  BaseSegmentedControl,
  BaseSurface,
  BaseText,
  BaseTooltip,
  type SegmentOption,
} from '@horizon/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useMapStore, type MapBasemap } from '../model/map.store'

// Camera-wide controls only; following a UAV is a UAV action in its inspector.
const map = useMapStore()
const { basemap, perspective } = storeToRefs(map)

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
</script>

<template>
  <!-- Bottom-row group: same 40px height as the other bottom pills. -->
  <div class="flex items-end gap-2">
    <BaseSurface variant="floating" shape="pill" class="flex gap-0.5 p-1">
      <!-- Shows the perspective it switches to, like Apple Maps. -->
      <BaseTooltip
        :text="perspective === '3d' ? 'Switch to 2D view' : 'Switch to 3D view'"
        placement="top"
      >
        <BaseIconButton
          :label="perspective === '3d' ? 'Switch to 2D view' : 'Switch to 3D view'"
          @click="togglePerspective"
        >
          <BaseText variant="label-md" tone="inherit">{{
            perspective === '3d' ? '2D' : '3D'
          }}</BaseText>
        </BaseIconButton>
      </BaseTooltip>
      <!-- Home: back to the whole operating area (the crosshair means "this UAV"). -->
      <BaseTooltip text="Back to the whole operating area" placement="top">
        <BaseIconButton label="Reset view" @click="map.resetView()">
          <House />
        </BaseIconButton>
      </BaseTooltip>
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

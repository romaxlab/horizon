<script setup lang="ts">
import { BaseSurface, BaseText } from '@horizon/ui'
import { FleetPanel } from '@/modules/fleet'
import { MapCanvas, MapControls } from '@/modules/map'
import { useControlCenter } from '../model/useControlCenter'
import ControlCenterHeader from './ControlCenterHeader.vue'

const { connection, clock, mission, uavs, selectedUavId, selectUav } = useControlCenter()
</script>

<template>
  <div class="relative h-full overflow-hidden bg-canvas">
    <main class="absolute inset-0" aria-label="Operational map">
      <MapCanvas :uavs="uavs" :selected-uav-id="selectedUavId" @select="selectUav" />
    </main>

    <!-- Floating panels. The overlay ignores pointer events so the map stays interactive. -->
    <div class="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
      <ControlCenterHeader :connection="connection" :clock="clock" :mission-title="mission.title" />

      <div class="flex min-h-0 flex-1 items-start justify-between gap-3">
        <BaseSurface
          as="aside"
          variant="floating"
          class="pointer-events-auto flex max-h-full w-80 flex-col overflow-hidden"
          aria-label="Fleet"
        >
          <FleetPanel />
        </BaseSurface>

        <MapControls :selected-uav-id="selectedUavId" class="pointer-events-auto mb-12 self-end" />
      </div>
    </div>

    <BaseSurface
      variant="floating"
      shape="pill"
      class="absolute bottom-4 left-1/2 flex h-10 -translate-x-1/2 items-center gap-3 px-4"
      aria-label="Mission status"
    >
      <BaseText variant="label-lg">{{ mission.state }}</BaseText>
      <BaseText variant="body-md" tone="muted" numeric>{{ mission.detail }}</BaseText>
    </BaseSurface>
  </div>
</template>

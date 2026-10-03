<script setup lang="ts">
import { BaseSurface, BaseText } from '@horizon/ui'
import { FleetPanel } from '@/modules/fleet'
import { useControlCenter } from '../model/useControlCenter'
import ControlCenterHeader from './ControlCenterHeader.vue'

const { connection, clock, mission } = useControlCenter()
</script>

<template>
  <div class="relative h-full overflow-hidden bg-canvas">
    <!-- Map area: full-bleed; replaced by the Cesium map. -->
    <main class="absolute inset-0 grid place-items-center" aria-label="Operational map">
      <BaseText variant="label-md" tone="muted">3D map</BaseText>
    </main>

    <!-- Floating panels. The overlay ignores pointer events so the map stays interactive. -->
    <div class="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
      <ControlCenterHeader :connection="connection" :clock="clock" :mission-title="mission.title" />

      <div class="flex min-h-0 flex-1 items-start gap-3">
        <BaseSurface
          as="aside"
          variant="floating"
          class="pointer-events-auto flex max-h-full w-80 flex-col overflow-hidden"
          aria-label="Fleet"
        >
          <FleetPanel />
        </BaseSurface>
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

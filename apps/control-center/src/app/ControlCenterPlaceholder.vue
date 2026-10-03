<script setup lang="ts">
// Temporary page until the Control Center shell exists; shows the live fleet pipeline.
import { BaseBadge, BaseButton, BaseSurface, BaseText, useTheme } from '@horizon/ui'
import { storeToRefs } from 'pinia'
import { useFleetStore, useFleetSync } from '@/modules/fleet'

useFleetSync()
const { uavs, connectionStatus } = storeToRefs(useFleetStore())
const { theme, toggleTheme } = useTheme()
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-4 p-8">
    <div class="flex items-center justify-between">
      <BaseText variant="heading-lg">Horizon · fleet pipeline</BaseText>
      <div class="flex items-center gap-2">
        <BaseBadge :variant="connectionStatus === 'live' ? 'success' : 'warning'" dot>
          {{ connectionStatus }}
        </BaseBadge>
        <BaseButton size="sm" @click="toggleTheme">{{ theme }}</BaseButton>
      </div>
    </div>
    <BaseSurface variant="raised" class="divide-y divide-border-subtle">
      <div
        v-for="state in uavs"
        :key="state.uav.id"
        class="grid grid-cols-6 items-center gap-2 px-3 py-1.5"
      >
        <BaseText variant="label-md">{{ state.uav.name }}</BaseText>
        <BaseBadge :variant="state.status === 'active' ? 'info' : 'neutral'">
          {{ state.status }}
        </BaseBadge>
        <BaseText variant="body-sm" tone="secondary" numeric>
          {{ state.telemetry?.battery.toFixed(1) }} %
        </BaseText>
        <BaseText variant="body-sm" tone="secondary" numeric>
          {{ state.telemetry?.position.altitude.toFixed(0) }} m
        </BaseText>
        <BaseText variant="body-sm" tone="secondary" numeric>
          {{ state.telemetry?.speed.toFixed(1) }} m/s
        </BaseText>
        <BaseText variant="body-sm" tone="muted" numeric>
          wp {{ state.telemetry?.currentWaypoint ?? '–' }}
        </BaseText>
      </div>
    </BaseSurface>
  </main>
</template>

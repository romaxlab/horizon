<script setup lang="ts">
import {
  BaseAlert,
  BaseBadge,
  BaseButton,
  BaseDivider,
  BaseInput,
  BaseMetric,
  BaseProgress,
  BaseSurface,
  BaseText,
  useTheme,
} from '@horizon/ui'

const { theme, toggleTheme } = useTheme()
</script>

<template>
  <main class="grid min-h-full place-items-center p-8">
    <BaseSurface variant="floating" padding="md" class="flex w-96 flex-col gap-4">
      <div class="flex items-center justify-between">
        <BaseText variant="heading-md">Horizon</BaseText>
        <BaseButton size="sm" @click="toggleTheme">{{ theme }}</BaseButton>
      </div>
      <div class="flex gap-2">
        <BaseBadge variant="success" dot>Live</BaseBadge>
        <BaseBadge variant="warning" dot>Warning</BaseBadge>
        <BaseBadge variant="danger" dot>Offline</BaseBadge>
        <BaseBadge>Standby</BaseBadge>
      </div>
      <BaseDivider />
      <div class="grid grid-cols-3 gap-3">
        <BaseMetric label="Battery" :value="82" unit="%" />
        <BaseMetric label="Altitude" :value="120" unit="m" />
        <BaseMetric label="Signal" :value="-71" unit="dBm" tone="warning" />
      </div>
      <BaseProgress label="Mission progress" :value="0.42" />
      <BaseInput label="Mission name" placeholder="Area Scan" />
      <BaseAlert variant="danger" title="Low battery">
        UAV-03 · 18%
        <template #actions><BaseButton size="sm">Inspect</BaseButton></template>
      </BaseAlert>
      <BaseButton variant="primary">Launch Mission</BaseButton>
    </BaseSurface>
  </main>
</template>

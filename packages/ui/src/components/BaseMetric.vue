<script setup lang="ts">
import BaseText, { type TextTone } from './BaseText.vue'

const {
  label,
  value,
  unit,
  tone = 'primary',
} = defineProps<{
  label: string
  value: string | number
  unit?: string
  tone?: TextTone
}>()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-0.5">
    <BaseText variant="label-sm" tone="muted" truncate>{{ label }}</BaseText>
    <div class="flex items-baseline gap-1">
      <BaseText variant="heading-md" :tone="tone" numeric>{{ value }}</BaseText>
      <BaseText v-if="unit" variant="caption" tone="muted">{{ unit }}</BaseText>
    </div>
  </div>
</template>

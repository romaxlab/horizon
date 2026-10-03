<script setup lang="ts">
import { cva } from 'class-variance-authority'
import { computed } from 'vue'

export type ProgressTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const {
  value,
  max = 1,
  label,
  tone = 'info',
} = defineProps<{
  value: number
  max?: number
  /** Accessible name for the progress bar. */
  label: string
  tone?: ProgressTone
}>()

const ratio = computed(() => (max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0))

const fill = cva('h-full rounded-full transition-[width] duration-300', {
  variants: {
    tone: {
      info: 'bg-status-info',
      success: 'bg-status-success',
      warning: 'bg-status-warning',
      danger: 'bg-status-danger',
      neutral: 'bg-status-neutral',
    },
  },
})
</script>

<template>
  <div
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="Math.round(ratio * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
    class="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
  >
    <div :class="fill({ tone })" :style="{ width: `${ratio * 100}%` }" />
  </div>
</template>

<script setup lang="ts">
import { cva } from 'class-variance-authority'
import { computed } from 'vue'
import type { ProgressTone } from './BaseProgress.vue'

const {
  values,
  min,
  max,
  label,
  tone = 'info',
} = defineProps<{
  values: readonly number[]
  /** Fixed range bounds; each defaults to the data extent. */
  min?: number
  max?: number
  /** Accessible name describing the trend. */
  label: string
  tone?: ProgressTone
}>()

// Drawn in a fixed viewBox and stretched to the element; strokes keep their width.
const WIDTH = 100
const HEIGHT = 32
const INSET = 2

const path = computed(() => {
  if (values.length < 2) return ''
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const span = hi - lo
  const step = WIDTH / (values.length - 1)
  const y = (value: number) =>
    span > 0
      ? INSET + (1 - (Math.min(Math.max(value, lo), hi) - lo) / span) * (HEIGHT - 2 * INSET)
      : HEIGHT / 2
  return values
    .map((value, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${y(value).toFixed(2)}`)
    .join('')
})

const line = cva('', {
  variants: {
    tone: {
      info: 'text-status-info',
      success: 'text-status-success',
      warning: 'text-status-warning',
      danger: 'text-status-danger',
      neutral: 'text-status-neutral',
    },
  },
})
</script>

<template>
  <svg
    role="img"
    :aria-label="label"
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    preserveAspectRatio="none"
    class="block h-8 w-full overflow-visible"
    :class="line({ tone })"
  >
    <path
      :d="path"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

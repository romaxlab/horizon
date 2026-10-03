<script setup lang="ts">
import { cva } from 'class-variance-authority'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info'
export type BadgeAppearance = 'fill' | 'plain'

const { variant = 'neutral', appearance = 'fill' } = defineProps<{
  /** Status meaning; shown as the dot color. The label text always carries the meaning too. */
  variant?: BadgeVariant
  /** `plain` drops the background for dense lists. */
  appearance?: BadgeAppearance
}>()

const badge = cva('inline-flex items-center gap-1.5 text-label-sm whitespace-nowrap', {
  variants: {
    appearance: {
      fill: 'h-5 rounded-full bg-fill px-2 text-text-secondary',
      plain: 'text-text-secondary',
    },
  },
})

const dot = cva('size-1.5 shrink-0 rounded-full', {
  variants: {
    variant: {
      neutral: 'bg-status-neutral',
      success: 'bg-status-success',
      warning: 'bg-status-warning',
      danger: 'bg-status-danger',
      info: 'bg-status-info',
    },
  },
})
</script>

<template>
  <span :class="badge({ appearance })">
    <span :class="dot({ variant })" aria-hidden="true" />
    <slot />
  </span>
</template>

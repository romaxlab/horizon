<script setup lang="ts">
import { cva } from 'class-variance-authority'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const { variant = 'neutral', dot = false } = defineProps<{
  variant?: BadgeVariant
  /** Leading status dot. The badge text still carries the meaning. */
  dot?: boolean
}>()

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-sm px-1.5 text-label-sm whitespace-nowrap uppercase',
  {
    variants: {
      variant: {
        neutral: 'bg-status-neutral-subtle text-text-secondary',
        success: 'bg-status-success-subtle text-status-success',
        warning: 'bg-status-warning-subtle text-status-warning',
        danger: 'bg-status-danger-subtle text-status-danger',
        info: 'bg-status-info-subtle text-status-info',
      },
    },
  },
)
</script>

<template>
  <span :class="badge({ variant })">
    <span v-if="dot" class="size-1.5 rounded-full bg-current" aria-hidden="true" />
    <slot />
  </span>
</template>

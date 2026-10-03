<script setup lang="ts">
import { cva } from 'class-variance-authority'

export type IconButtonVariant = 'ghost' | 'secondary'
export type IconButtonSize = 'sm' | 'md'

const {
  label,
  variant = 'ghost',
  size = 'md',
  pressed = undefined,
} = defineProps<{
  /** Accessible name; icon-only actions must be labelled. */
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** Toggle state. Leave undefined for plain actions. */
  pressed?: boolean
}>()

const iconButton = cva(
  'inline-flex shrink-0 items-center justify-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
  {
    variants: {
      variant: {
        ghost:
          'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        secondary:
          'border-border-default bg-surface-raised text-text-primary hover:bg-surface-hover',
      },
      size: {
        sm: 'size-control-sm',
        md: 'size-control-md',
      },
      pressed: {
        true: 'border-border-focus bg-surface-hover text-action-primary',
      },
    },
  },
)
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :aria-pressed="pressed"
    :class="iconButton({ variant, size, pressed })"
  >
    <slot />
  </button>
</template>

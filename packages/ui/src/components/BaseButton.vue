<script setup lang="ts">
import { cva } from 'class-variance-authority'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const {
  variant = 'secondary',
  size = 'md',
  type = 'button',
  block = false,
} = defineProps<{
  variant?: ButtonVariant
  size?: ButtonSize
  type?: 'button' | 'submit' | 'reset'
  block?: boolean
}>()

const button = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md border whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-action-primary text-action-primary-text hover:bg-action-primary-hover',
        secondary:
          'border-border-default bg-surface-raised text-text-primary hover:bg-surface-hover',
        ghost:
          'border-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        danger: 'border-transparent bg-status-danger text-text-inverse hover:opacity-90',
      },
      size: {
        sm: 'h-control-sm px-2.5 text-label-md',
        md: 'h-control-md px-3.5 text-label-lg',
      },
      block: { true: 'w-full' },
    },
  },
)
</script>

<template>
  <button :type="type" :class="button({ variant, size, block })">
    <slot />
  </button>
</template>

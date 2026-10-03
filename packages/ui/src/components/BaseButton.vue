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
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
  {
    variants: {
      variant: {
        primary: 'bg-action-primary text-action-primary-text hover:bg-action-primary-hover',
        secondary: 'bg-fill text-text-primary hover:bg-fill-strong',
        ghost: 'text-text-secondary hover:bg-fill hover:text-text-primary',
        danger: 'bg-status-danger text-text-inverse hover:opacity-90',
      },
      size: {
        sm: 'h-control-sm px-3 text-label-md',
        md: 'h-control-md px-4 text-label-lg',
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

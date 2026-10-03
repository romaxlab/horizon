<script setup lang="ts">
import { cva } from 'class-variance-authority'

export type TextVariant =
  | 'display'
  | 'heading-lg'
  | 'heading-md'
  | 'heading-sm'
  | 'body-lg'
  | 'body-md'
  | 'body-sm'
  | 'label-lg'
  | 'label-md'
  | 'label-sm'
  | 'caption'

export type TextTone =
  'primary' | 'secondary' | 'muted' | 'success' | 'warning' | 'danger' | 'info' | 'inherit'

const {
  as = 'span',
  variant = 'body-md',
  tone = 'primary',
  numeric = false,
  truncate = false,
} = defineProps<{
  as?: string
  variant?: TextVariant
  tone?: TextTone
  /** Tabular digits for values that update in place. */
  numeric?: boolean
  truncate?: boolean
}>()

const text = cva('', {
  variants: {
    variant: {
      display: 'text-display',
      'heading-lg': 'text-heading-lg',
      'heading-md': 'text-heading-md',
      'heading-sm': 'text-heading-sm',
      'body-lg': 'text-body-lg',
      'body-md': 'text-body-md',
      'body-sm': 'text-body-sm',
      'label-lg': 'text-label-lg',
      'label-md': 'text-label-md',
      'label-sm': 'text-label-sm',
      caption: 'text-caption',
    },
    tone: {
      primary: 'text-text-primary',
      secondary: 'text-text-secondary',
      muted: 'text-text-muted',
      success: 'text-status-success',
      warning: 'text-status-warning',
      danger: 'text-status-danger',
      info: 'text-status-info',
      inherit: '',
    },
    numeric: { true: 'tabular-nums' },
    truncate: { true: 'truncate' },
  },
})
</script>

<template>
  <component :is="as" :class="text({ variant, tone, numeric, truncate })">
    <slot />
  </component>
</template>

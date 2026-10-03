<script setup lang="ts">
import { cva } from 'class-variance-authority'

export type SurfaceVariant = 'panel' | 'floating' | 'subtle' | 'raised'
export type SurfacePadding = 'none' | 'sm' | 'md'

const {
  as = 'div',
  variant = 'panel',
  padding = 'none',
} = defineProps<{
  as?: string
  variant?: SurfaceVariant
  padding?: SurfacePadding
}>()

const surface = cva('', {
  variants: {
    variant: {
      panel: 'bg-surface',
      floating:
        'rounded-lg border border-border-subtle bg-overlay shadow-floating backdrop-blur-md',
      subtle: 'rounded-md bg-surface-sunken',
      raised: 'rounded-md border border-border-subtle bg-surface-raised',
    },
    padding: {
      none: '',
      sm: 'p-2',
      md: 'p-4',
    },
  },
})
</script>

<template>
  <component :is="as" :class="surface({ variant, padding })">
    <slot />
  </component>
</template>

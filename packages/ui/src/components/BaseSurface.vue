<script setup lang="ts">
import { cva } from 'class-variance-authority'

export type SurfaceVariant = 'panel' | 'floating' | 'subtle' | 'raised'
export type SurfacePadding = 'none' | 'sm' | 'md'
export type SurfaceShape = 'rounded' | 'pill'

const {
  as = 'div',
  variant = 'panel',
  padding = 'none',
  shape = 'rounded',
} = defineProps<{
  as?: string
  /** `floating` is the translucent material for panels over the map. */
  variant?: SurfaceVariant
  padding?: SurfacePadding
  shape?: SurfaceShape
}>()

const surface = cva('', {
  variants: {
    variant: {
      panel: 'bg-surface',
      // Glass material: tint, blur, saturation and edge highlight all come from tokens.
      floating:
        'bg-glass shadow-floating backdrop-blur-(--glass-blur) backdrop-saturate-(--glass-saturation)',
      subtle: 'bg-fill',
      raised: 'bg-surface-raised shadow-raised',
    },
    padding: {
      none: '',
      sm: 'p-2',
      md: 'p-4',
    },
    shape: {
      rounded: '',
      pill: 'rounded-full',
    },
  },
  compoundVariants: [
    { variant: 'floating', shape: 'rounded', class: 'rounded-xl' },
    { variant: ['subtle', 'raised'], shape: 'rounded', class: 'rounded-lg' },
  ],
})
</script>

<template>
  <component :is="as" :class="surface({ variant, padding, shape })">
    <slot />
  </component>
</template>

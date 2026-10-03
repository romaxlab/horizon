<script setup lang="ts">
import { cva } from 'class-variance-authority'

export type IconButtonVariant = 'ghost' | 'secondary' | 'media'
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
  'inline-flex shrink-0 items-center justify-center rounded-full cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
  {
    variants: {
      variant: {
        ghost: 'text-text-secondary hover:bg-fill hover:text-text-primary',
        secondary: 'bg-fill text-text-primary hover:bg-fill-strong',
        // On top of video/imagery: light glyph on a dark translucent disc, legible on any frame.
        media:
          'bg-media-scrim text-on-media ring-1 ring-on-media/30 backdrop-blur-sm hover:bg-on-media/25',
      },
      size: {
        sm: 'size-control-sm',
        md: 'size-control-md',
      },
      pressed: {
        true: 'bg-fill-strong text-text-primary',
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

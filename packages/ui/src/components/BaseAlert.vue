<script setup lang="ts">
import { cva } from 'class-variance-authority'
import BaseText from './BaseText.vue'

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

const { variant = 'info', title } = defineProps<{
  variant?: AlertVariant
  title: string
}>()

defineSlots<{
  default?: () => unknown
  actions?: () => unknown
}>()

const alert = cva(
  'flex items-start gap-3 rounded-md border-l-2 bg-surface-raised py-2.5 pr-2.5 pl-3',
  {
    variants: {
      variant: {
        info: 'border-status-info',
        success: 'border-status-success',
        warning: 'border-status-warning',
        danger: 'border-status-danger',
      },
    },
  },
)
</script>

<template>
  <div :role="variant === 'danger' ? 'alert' : 'status'" :class="alert({ variant })">
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <BaseText variant="label-sm" :tone="variant">{{ title }}</BaseText>
      <BaseText v-if="$slots.default" variant="body-sm" tone="secondary">
        <slot />
      </BaseText>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1.5">
      <slot name="actions" />
    </div>
  </div>
</template>

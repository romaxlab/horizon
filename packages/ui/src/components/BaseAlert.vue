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

const marker = cva('mt-1.5 size-2 shrink-0 rounded-full', {
  variants: {
    variant: {
      info: 'bg-status-info',
      success: 'bg-status-success',
      warning: 'bg-status-warning',
      danger: 'bg-status-danger',
    },
  },
})
</script>

<template>
  <div
    :role="variant === 'danger' ? 'alert' : 'status'"
    class="flex items-start gap-3 rounded-lg bg-surface-raised p-3 shadow-raised"
  >
    <span :class="marker({ variant })" aria-hidden="true" />
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <BaseText variant="heading-sm" :tone="variant">{{ title }}</BaseText>
      <BaseText v-if="$slots.default" variant="body-sm" tone="secondary">
        <slot />
      </BaseText>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1.5 self-center">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import BaseText from './BaseText.vue'

const {
  label,
  type = 'text',
  invalid = false,
  hint,
  hideLabel = false,
} = defineProps<{
  label: string
  type?: 'text' | 'number' | 'search'
  invalid?: boolean
  hint?: string
  /** Keeps the label for assistive technology only (e.g. a search field with a placeholder). */
  hideLabel?: boolean
}>()

defineOptions({ inheritAttrs: false })

const model = defineModel<string | number>()
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1">
    <BaseText
      as="label"
      :for="id"
      variant="label-md"
      tone="secondary"
      :class="{ 'sr-only': hideLabel }"
      >{{ label }}</BaseText
    >
    <input
      :id="id"
      v-model="model"
      :type="type"
      :aria-invalid="invalid || undefined"
      :aria-describedby="hint ? `${id}-hint` : undefined"
      class="h-control-md rounded-md border border-border-control bg-fill px-3 text-body-md text-text-primary transition-colors placeholder:text-text-muted focus-visible:border-border-focus aria-invalid:border-status-danger"
      v-bind="$attrs"
    />
    <BaseText v-if="hint" :id="`${id}-hint`" variant="caption" :tone="invalid ? 'danger' : 'muted'">
      {{ hint }}
    </BaseText>
  </div>
</template>

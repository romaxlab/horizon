<script setup lang="ts">
import { useId } from 'vue'
import BaseText from './BaseText.vue'

const { label, disabled = false } = defineProps<{
  /** Visible name of the setting; also the switch's accessible name. */
  label: string
  disabled?: boolean
}>()

const model = defineModel<boolean>({ required: true })
const id = useId()
</script>

<template>
  <div class="flex items-center gap-3" :class="disabled && 'opacity-40'">
    <BaseText :id="`${id}-label`" variant="label-md" class="min-w-0 flex-1" truncate>
      {{ label }}
    </BaseText>
    <button
      type="button"
      role="switch"
      :aria-checked="model"
      :aria-labelledby="`${id}-label`"
      :disabled="disabled"
      class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors disabled:pointer-events-none"
      :class="model ? 'bg-action-primary' : 'bg-fill-strong'"
      @click="model = !model"
    >
      <span
        aria-hidden="true"
        class="size-4 rounded-full bg-surface-raised shadow-raised transition-transform"
        :class="model ? 'translate-x-4' : 'translate-x-0'"
      />
    </button>
  </div>
</template>

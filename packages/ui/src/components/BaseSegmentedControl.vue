<script setup lang="ts" generic="T extends string">
import { cva } from 'class-variance-authority'
import { useTemplateRef } from 'vue'

export interface SegmentOption<V extends string = string> {
  value: V
  label: string
  disabled?: boolean
  /** Explains a disabled option or adds detail. */
  hint?: string
}

const { options, label } = defineProps<{
  options: SegmentOption<T>[]
  /** Accessible name of the group. */
  label: string
}>()

const model = defineModel<T>({ required: true })
const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')

const segment = cva(
  'h-control-sm rounded-full px-3 text-label-md whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      selected: {
        true: 'bg-surface-raised text-text-primary shadow-raised',
        false: 'text-text-secondary hover:text-text-primary',
      },
    },
  },
)

/** Arrow keys move the selection between enabled options (radio group pattern). */
function onKeydown(event: KeyboardEvent, index: number) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (step === 0) return
  event.preventDefault()
  for (let i = 1; i <= options.length; i++) {
    const next = (index + step * i + options.length) % options.length
    const option = options[next]
    if (option && !option.disabled) {
      model.value = option.value
      buttons.value?.[next]?.focus()
      return
    }
  }
}
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="label"
    class="inline-flex items-center gap-0.5 rounded-full bg-fill p-0.5"
  >
    <button
      v-for="(option, index) in options"
      ref="buttons"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :tabindex="model === option.value ? 0 : -1"
      :disabled="option.disabled"
      :title="option.hint"
      :class="segment({ selected: model === option.value })"
      @click="model = option.value"
      @keydown="onKeydown($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

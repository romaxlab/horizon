<script setup lang="ts">
import { Square } from '@lucide/vue'
import { BaseButton, BaseProgress, BaseSurface, BaseText } from '@horizon/ui'
import { ref, watch } from 'vue'

const props = defineProps<{
  state: string
  detail: string
  progress: number | null
  /** Shows the Stop action. */
  canStop: boolean
  stopping: boolean
}>()

const emit = defineEmits<{ stop: [] }>()

/** Stopping recalls every UAV, so it takes an explicit second click. */
const confirming = ref(false)
watch(
  () => props.canStop,
  (canStop) => {
    if (!canStop) confirming.value = false
  },
)

function confirmStop() {
  confirming.value = false
  emit('stop')
}
</script>

<template>
  <BaseSurface
    variant="floating"
    shape="pill"
    class="pointer-events-auto flex h-10 items-center gap-3 self-center pr-1 pl-4"
    :class="{ 'pr-4': !canStop }"
    aria-label="Mission status"
  >
    <template v-if="confirming">
      <BaseText variant="label-lg" class="whitespace-nowrap"
        >Stop mission and recall UAVs?</BaseText
      >
      <div class="flex gap-1">
        <BaseButton size="sm" variant="ghost" @click="confirming = false">Cancel</BaseButton>
        <BaseButton size="sm" variant="danger" @click="confirmStop">Stop</BaseButton>
      </div>
    </template>
    <template v-else>
      <BaseText variant="label-lg" numeric>{{ state }}</BaseText>
      <BaseProgress
        v-if="progress !== null"
        label="Mission progress"
        :value="progress"
        class="w-24"
      />
      <BaseText variant="body-md" tone="muted" numeric class="whitespace-nowrap">
        {{ detail }}
      </BaseText>
      <BaseButton
        v-if="canStop"
        size="sm"
        variant="secondary"
        :disabled="stopping"
        @click="confirming = true"
      >
        <Square />
        {{ stopping ? 'Stopping…' : 'Stop' }}
      </BaseButton>
    </template>
  </BaseSurface>
</template>

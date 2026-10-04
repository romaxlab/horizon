<script setup lang="ts">
import { ChevronUp, Square } from '@lucide/vue'
import { BaseButton, BaseIconButton, BaseProgress, BaseSurface, BaseText } from '@horizon/ui'
import { ref, watch } from 'vue'

const props = defineProps<{
  state: string
  detail: string
  /** Phase counts of an active mission ("2 en route · 3 scanning · …"); replaces `detail`. */
  phases: { text: string; tone: 'muted' | 'warning' }[] | null
  progress: number | null
  /** Shows the Stop action. */
  canStop: boolean
  stopping: boolean
  /** Last failed stop attempt; cleared by the next one. */
  stopError: string | null
  /** Whether the per-UAV mission details are shown; null hides the toggle. */
  detailsOpen: boolean | null
}>()

const emit = defineEmits<{ stop: []; toggleDetails: [] }>()

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
    class="pointer-events-auto flex h-10 items-center gap-3 self-center pr-1 pl-4 max-sm:w-full"
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
      <!-- Fixed track width from the wrapper; the progress bar fills it. -->
      <div v-if="progress !== null" class="w-24 shrink-0 max-sm:w-auto max-sm:flex-1">
        <BaseProgress label="Mission progress" :value="progress" />
      </div>
      <BaseText v-if="!phases" variant="body-md" tone="muted" numeric class="whitespace-nowrap">
        {{ detail }}
      </BaseText>
      <!-- Phones: phase counts live in the details popover (chevron). -->
      <BaseText
        v-else
        variant="body-md"
        tone="muted"
        numeric
        class="whitespace-nowrap max-sm:hidden"
      >
        <template v-for="(phase, index) in phases" :key="phase.text">
          <template v-if="index > 0"> · </template>
          <span :class="phase.tone === 'warning' && 'text-status-warning'">{{ phase.text }}</span>
        </template>
      </BaseText>
      <BaseText
        v-if="stopError && !stopping"
        variant="label-md"
        tone="danger"
        role="alert"
        :title="stopError"
        class="whitespace-nowrap"
      >
        Stop failed
      </BaseText>
      <BaseIconButton
        v-if="detailsOpen !== null"
        size="sm"
        :label="detailsOpen ? 'Hide mission details' : 'Show mission details'"
        :aria-expanded="detailsOpen"
        aria-controls="mission-details"
        @click="emit('toggleDetails')"
      >
        <ChevronUp class="transition-transform" :class="detailsOpen && 'rotate-180'" />
      </BaseIconButton>
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

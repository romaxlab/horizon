<script setup lang="ts">
import { Crosshair, Navigation, X } from '@lucide/vue'
import {
  BaseAlert,
  BaseBadge,
  BaseButton,
  BaseDivider,
  BaseIconButton,
  BaseMetric,
  BaseProgress,
  BaseSparkline,
  BaseText,
} from '@horizon/ui'
import { onBeforeUnmount, onMounted } from 'vue'
import { useUavInspector } from '../model/useUavInspector'

defineProps<{ following: boolean }>()
const emit = defineEmits<{ close: []; focus: []; toggleFollow: [] }>()

defineSlots<{
  /** Media area (simulated video) provided by the composing view. */
  media?: () => unknown
}>()

const { inspector } = useUavInspector()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <section v-if="inspector" class="flex min-h-0 flex-col" aria-labelledby="uav-inspector-title">
    <header class="flex items-start gap-2 px-4 pt-4 pb-3">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex items-center gap-2">
          <BaseText id="uav-inspector-title" as="h2" variant="heading-md" truncate>
            {{ inspector.name }}
          </BaseText>
          <BaseBadge :variant="inspector.status.variant">{{ inspector.status.label }}</BaseBadge>
        </div>
        <BaseText variant="caption" tone="muted" truncate>{{ inspector.subtitle }}</BaseText>
      </div>
      <BaseIconButton size="sm" label="Close inspector" @click="emit('close')">
        <X />
      </BaseIconButton>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
      <slot name="media" />

      <BaseAlert
        v-if="inspector.issues.length > 0"
        variant="warning"
        :title="inspector.issues.join(' · ')"
      />

      <div v-if="inspector.battery" class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between">
          <BaseText variant="caption" tone="muted">Battery</BaseText>
          <BaseText variant="label-lg" numeric>{{ inspector.battery.label }}</BaseText>
        </div>
        <BaseProgress
          label="Battery"
          :value="inspector.battery.value"
          :max="100"
          :tone="inspector.battery.tone"
        />
      </div>

      <div class="grid grid-cols-3 gap-x-3 gap-y-4">
        <BaseMetric
          v-for="metric in inspector.metrics"
          :key="metric.label"
          :label="metric.label"
          :value="metric.value"
          :unit="metric.unit"
          :tone="metric.tone"
        />
        <BaseMetric
          label="Updated"
          :value="inspector.lastUpdate.label"
          :tone="inspector.lastUpdate.degraded ? 'warning' : 'primary'"
        />
      </div>

      <div v-if="inspector.trends" class="flex flex-col gap-2">
        <BaseText variant="caption" tone="muted">{{ inspector.trends.window }}</BaseText>
        <div class="grid grid-cols-3 gap-3">
          <div
            v-for="trend in inspector.trends.series"
            :key="trend.label"
            class="flex min-w-0 flex-col gap-1"
          >
            <BaseSparkline
              :label="`${trend.label} trend, ${inspector.trends.window.toLowerCase()}`"
              :values="trend.values"
              :min="trend.min"
              :max="trend.max"
              :tone="trend.tone"
            />
            <BaseText variant="caption" tone="secondary">{{ trend.label }}</BaseText>
          </div>
        </div>
      </div>

      <BaseDivider />

      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 flex-col">
          <BaseText variant="caption" tone="muted">Mission</BaseText>
          <BaseText variant="label-lg" truncate>
            {{ inspector.mission ? 'Area Scan' : 'Not assigned' }}
          </BaseText>
        </div>
        <BaseText
          v-if="inspector.mission?.returning"
          variant="body-md"
          :tone="inspector.mission.returning.includes('battery') ? 'warning' : 'secondary'"
        >
          {{ inspector.mission.returning }}
        </BaseText>
        <BaseText
          v-else-if="inspector.mission?.waypoint"
          variant="body-md"
          tone="secondary"
          numeric
        >
          Waypoint {{ inspector.mission.waypoint }}
        </BaseText>
      </div>

      <div class="flex gap-2">
        <BaseButton size="sm" class="flex-1" @click="emit('focus')">
          <Crosshair />
          Center
        </BaseButton>
        <BaseButton
          size="sm"
          :variant="following ? 'primary' : 'secondary'"
          :aria-pressed="following"
          class="flex-1"
          @click="emit('toggleFollow')"
        >
          <Navigation />
          {{ following ? 'Following' : 'Follow' }}
        </BaseButton>
      </div>
    </div>
  </section>
</template>

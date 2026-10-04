<script setup lang="ts">
import { ChevronsDownUp, ChevronsUpDown, Crosshair, Navigation, X } from '@lucide/vue'
import {
  BaseAlert,
  BaseBadge,
  BaseDivider,
  BaseIconButton,
  BaseMetric,
  BaseProgress,
  BaseSparkline,
  BaseText,
  BaseTooltip,
  useDismissLayer,
} from '@horizon/ui'
import { computed } from 'vue'
import type { InspectorMission } from '../model/fleet.types'
import { useUavInspector } from '../model/useUavInspector'

const props = defineProps<{
  following: boolean
  /** The UAV's part in the current mission, from the composing view (fleet doesn't own missions). */
  mission: InspectorMission | null
  /** Only the header and a line of key readings, so the map stays visible (e.g. while following). */
  collapsed?: boolean
}>()
const emit = defineEmits<{
  close: []
  focus: []
  toggleFollow: []
  toggleCollapsed: []
}>()

defineSlots<{
  /** Media area (simulated video) provided by the composing view. */
  media?: () => unknown
}>()

const { inspector } = useUavInspector()

/** The collapsed line: health issues first, otherwise mission phase and key readings. */
const glance = computed(() => {
  const view = inspector.value
  if (!view) return null
  if (view.issues.length > 0) return { text: view.issues.join(' · '), tone: 'warning' as const }
  const parts = [props.mission?.phase, ...view.glance].filter((part) => part != null)
  return { text: parts.join(' · ') || view.subtitle, tone: 'secondary' as const }
})

// Escape closes the inspector when it is the top layer (popovers and the video focus come first).
useDismissLayer(
  computed(() => inspector.value !== null),
  () => {
    emit('close')
  },
)
</script>

<template>
  <section v-if="inspector" class="flex min-h-0 flex-col" aria-labelledby="uav-inspector-title">
    <header class="flex items-start gap-2 px-4 pt-4" :class="collapsed ? 'pb-4' : 'pb-3'">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex items-center gap-2">
          <BaseText id="uav-inspector-title" as="h2" variant="heading-md" truncate>
            {{ inspector.name }}
          </BaseText>
          <BaseBadge :variant="inspector.status.variant">{{ inspector.status.label }}</BaseBadge>
        </div>
        <!-- Collapsed: the readings line expands the inspector, like the toggle button. -->
        <button
          v-if="collapsed && glance"
          type="button"
          class="min-w-0 cursor-pointer text-left"
          title="Expand inspector"
          @click="emit('toggleCollapsed')"
        >
          <BaseText variant="caption" :tone="glance.tone" numeric truncate>
            {{ glance.text }}
          </BaseText>
        </button>
        <BaseText v-else variant="caption" tone="muted" truncate>{{ inspector.subtitle }}</BaseText>
      </div>
      <!-- Primary UAV actions stay in reach: the body scrolls, the header doesn't. -->
      <div class="flex shrink-0 items-center gap-0.5">
        <BaseTooltip text="Center on map" placement="bottom">
          <BaseIconButton size="sm" label="Center on map" @click="emit('focus')">
            <Crosshair />
          </BaseIconButton>
        </BaseTooltip>
        <BaseTooltip
          :text="following ? 'Stop following' : 'Follow with the camera'"
          placement="bottom"
        >
          <BaseIconButton
            size="sm"
            label="Follow"
            :pressed="following"
            @click="emit('toggleFollow')"
          >
            <Navigation />
          </BaseIconButton>
        </BaseTooltip>
        <BaseTooltip :text="collapsed ? 'Expand' : 'Collapse'" placement="bottom">
          <BaseIconButton
            size="sm"
            :label="collapsed ? 'Expand inspector' : 'Collapse inspector'"
            :aria-expanded="!collapsed"
            aria-controls="uav-inspector-body"
            @click="emit('toggleCollapsed')"
          >
            <ChevronsUpDown v-if="collapsed" />
            <ChevronsDownUp v-else />
          </BaseIconButton>
        </BaseTooltip>
        <BaseIconButton size="sm" label="Close inspector" @click="emit('close')">
          <X />
        </BaseIconButton>
      </div>
    </header>

    <div
      v-if="!collapsed"
      id="uav-inspector-body"
      class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
    >
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

      <div class="flex flex-col gap-1.5">
        <div class="flex items-end justify-between gap-3">
          <div class="flex min-w-0 flex-col">
            <BaseText variant="caption" tone="muted">Mission</BaseText>
            <BaseText variant="label-lg" truncate>{{ mission?.name ?? 'Not assigned' }}</BaseText>
          </div>
          <BaseText v-if="mission" variant="body-md" :tone="mission.tone" numeric truncate>
            {{ mission.phase }}
          </BaseText>
        </div>
        <template v-if="mission?.ratio != null">
          <BaseProgress label="UAV mission progress" :value="mission.ratio" />
          <div class="flex items-center justify-between gap-3">
            <BaseText variant="caption" tone="secondary" numeric>{{ mission.eta }}</BaseText>
            <BaseText
              v-if="mission.landingBattery"
              variant="caption"
              :tone="mission.landingBattery.tone"
              numeric
            >
              Battery on landing {{ mission.landingBattery.label }}
            </BaseText>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

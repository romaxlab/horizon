<script setup lang="ts">
import { FlaskConical, Info, X } from '@lucide/vue'
import {
  BaseButton,
  BaseDivider,
  BaseIconButton,
  BasePopover,
  BaseSegmentedControl,
  BaseSurface,
  BaseSwitch,
  BaseText,
  BaseTooltip,
} from '@horizon/ui'
import { computed, ref } from 'vue'
import type { DemoInjection, DemoPreset } from '../model/demo.types'
import DemoDiagnostics from './DemoDiagnostics.vue'
import type { DemoControls } from '../model/useDemoControls'

const { controls } = defineProps<{ controls: DemoControls }>()

/** Local presentation state: whether the panel is open. */
const open = ref(false)

const presets: { id: DemoPreset; label: string; hint: string }[] = [
  { id: 'normal', label: 'Normal', hint: 'Demo Area Scan, no failures' },
  {
    id: 'incident',
    label: 'Incident',
    hint: 'Demo Area Scan + scripted failures: signal, low battery, telemetry loss, outage',
  },
  { id: 'stress', label: 'Stress', hint: '480 UAVs for performance profiling' },
]
const activeHint = computed(
  () =>
    presets.find((p) => p.id === controls.activePreset.value)?.hint ??
    'No scenario running · pick one to reset the simulation',
)

/** Each failure is a switch: on injects it, off restores the previous behavior. */
const failures: { id: DemoInjection; label: string; hint: string }[] = [
  {
    id: 'lowBattery',
    label: 'Low battery',
    hint: 'Drops the charge to 18 %; the UAV aborts and flies home. Off restores the charge.',
  },
  {
    id: 'signalDegraded',
    label: 'Weak signal',
    hint: 'Link quality falls below the warning level.',
  },
  {
    id: 'telemetryLost',
    label: 'Telemetry loss',
    hint: 'The UAV keeps flying but stops reporting: stale after 5 s, then offline.',
  },
  {
    id: 'geofenceBreach',
    label: 'No-fly zone drift',
    hint: 'Pushes the UAV off its route into the nearest no-fly zone and holds it there. Off: it returns to its route.',
  },
]
const needsMission = (id: DemoInjection) =>
  id === 'geofenceBreach' &&
  !controls.target.value?.onMission &&
  !controls.injections.value.geofenceBreach
const failureHint = (failure: (typeof failures)[number]) =>
  !controls.target.value
    ? 'Select a UAV first.'
    : needsMission(failure.id)
      ? 'Select a UAV flying a mission first.'
      : failure.hint
</script>

<template>
  <BasePopover
    id="demo-controls"
    v-model:open="open"
    label="Demo controls"
    placement="top"
    panel-class="grid w-80 grid-cols-1 gap-3 overflow-y-auto p-4"
  >
    <template #trigger="{ toggle, triggerAttrs }">
      <BaseSurface variant="floating" shape="pill" class="pointer-events-auto p-1.5">
        <BaseButton size="sm" variant="ghost" v-bind="triggerAttrs" @click="toggle">
          <FlaskConical />
          Demo
        </BaseButton>
      </BaseSurface>
    </template>

    <div class="flex items-center justify-between">
      <BaseText as="h2" variant="heading-md">Demo controls</BaseText>
      <BaseIconButton size="sm" label="Close demo controls" @click="open = false">
        <X />
      </BaseIconButton>
    </div>

    <section class="flex flex-col gap-1.5">
      <BaseText variant="caption" tone="muted">Scenario</BaseText>
      <div class="grid grid-cols-3 gap-1.5">
        <BaseTooltip v-for="preset in presets" :key="preset.id" :text="preset.hint" class="flex">
          <BaseButton
            size="sm"
            class="flex-1"
            :variant="controls.activePreset.value === preset.id ? 'primary' : 'secondary'"
            :aria-pressed="controls.activePreset.value === preset.id"
            @click="controls.applyPreset(preset.id)"
          >
            {{ preset.label }}
          </BaseButton>
        </BaseTooltip>
      </div>
      <!-- Two caption lines, always reserved (h-7 = 2 × 14 px), so switching scenarios never
           makes the panel jump; the full text is in the native tooltip. -->
      <BaseText variant="caption" tone="secondary" class="line-clamp-2 h-7" :title="activeHint">
        {{ activeHint }}
      </BaseText>
    </section>

    <section class="flex flex-col gap-2" aria-label="Failures">
      <BaseTooltip
        text="Failures apply to the selected UAV. Switch one off to restore the previous behavior."
        placement="right"
        class="flex"
      >
        <span class="flex items-center gap-1 text-text-muted [&_svg]:size-3.5" tabindex="0">
          <BaseText variant="caption" tone="inherit" truncate>
            Failures on {{ controls.target.value?.name ?? 'no UAV' }}
          </BaseText>
          <Info aria-hidden="true" />
        </span>
      </BaseTooltip>
      <BaseTooltip
        v-for="failure in failures"
        :key="failure.id"
        :text="failureHint(failure)"
        placement="right"
      >
        <BaseSwitch
          :label="failure.label"
          :disabled="!controls.target.value || needsMission(failure.id)"
          :model-value="controls.injections.value[failure.id]"
          @update:model-value="controls.setInjection(failure.id, $event)"
        />
      </BaseTooltip>
      <BaseTooltip
        text="The app loses the backend and keeps the last known state. Off reconnects and resyncs."
        placement="right"
      >
        <BaseSwitch
          label="Network outage"
          :model-value="!controls.networkUp.value"
          @update:model-value="controls.setNetworkOutage($event)"
        />
      </BaseTooltip>
      <BaseTooltip
        :text="
          controls.anyInjected.value
            ? 'Switches every failure off and restores the network.'
            : 'Nothing is injected.'
        "
        class="flex"
      >
        <BaseButton
          size="sm"
          class="flex-1"
          :disabled="!controls.anyInjected.value"
          @click="controls.restoreAll()"
        >
          Restore all
        </BaseButton>
      </BaseTooltip>
    </section>

    <section class="flex flex-col gap-1.5">
      <BaseText variant="caption" tone="muted">Simulation</BaseText>
      <BaseSegmentedControl
        :model-value="controls.selectedTimeScale.value"
        label="Time scale"
        :options="controls.timeScaleOptions"
        @update:model-value="controls.setTimeScale"
      />
      <div class="grid grid-cols-2 gap-1.5">
        <BaseTooltip
          :text="
            controls.canCompleteMission.value
              ? 'Ends the scan now: UAVs return and land, then the mission completes.'
              : 'No mission is scanning.'
          "
          class="flex"
        >
          <BaseButton
            size="sm"
            class="flex-1"
            :disabled="!controls.canCompleteMission.value"
            @click="controls.completeMission()"
          >
            Complete mission
          </BaseButton>
        </BaseTooltip>
        <BaseTooltip
          :text="
            controls.canReset.value
              ? 'Back to the start: fleet parked, no mission, no failures.'
              : 'Already at the start: fleet parked, no mission, no failures.'
          "
          class="flex"
        >
          <BaseButton
            size="sm"
            variant="ghost"
            class="flex-1"
            :disabled="!controls.canReset.value"
            @click="controls.reset()"
          >
            Reset
          </BaseButton>
        </BaseTooltip>
      </div>
    </section>

    <!-- Fixed one-line status: command outcomes appear here without resizing the panel. -->
    <BaseTooltip :text="controls.feedback.value?.text ?? ''" class="flex h-4 items-center">
      <BaseText
        role="status"
        aria-live="polite"
        variant="caption"
        :tone="controls.feedback.value?.tone ?? 'muted'"
        truncate
      >
        {{ controls.feedback.value?.text ?? '' }}
      </BaseText>
    </BaseTooltip>

    <BaseDivider />
    <DemoDiagnostics :rows="controls.diagnosticsRows" />
  </BasePopover>
</template>

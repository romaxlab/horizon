<script setup lang="ts">
import { FlaskConical, X } from '@lucide/vue'
import {
  BaseAlert,
  BaseButton,
  BaseDivider,
  BaseIconButton,
  BaseSegmentedControl,
  BaseSurface,
  BaseText,
} from '@horizon/ui'
import { computed, ref } from 'vue'
import type { DemoPreset } from '../model/demo.types'
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
</script>

<template>
  <div class="relative">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-1 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-1 opacity-0"
    >
      <BaseSurface
        v-if="open"
        variant="floating"
        class="pointer-events-auto absolute bottom-full left-0 mb-3 flex w-80 flex-col gap-3 p-4"
        aria-label="Demo controls"
      >
        <div class="flex items-center justify-between">
          <BaseText as="h2" variant="heading-md">Demo controls</BaseText>
          <BaseIconButton size="sm" label="Close demo controls" @click="open = false">
            <X />
          </BaseIconButton>
        </div>

        <section class="flex flex-col gap-1.5">
          <BaseText variant="caption" tone="muted">Scenario</BaseText>
          <div class="grid grid-cols-3 gap-1.5">
            <BaseButton
              v-for="preset in presets"
              :key="preset.id"
              size="sm"
              :variant="controls.activePreset.value === preset.id ? 'primary' : 'secondary'"
              :aria-pressed="controls.activePreset.value === preset.id"
              :title="preset.hint"
              @click="controls.applyPreset(preset.id)"
            >
              {{ preset.label }}
            </BaseButton>
          </div>
          <BaseText variant="caption" tone="secondary">{{ activeHint }}</BaseText>
        </section>

        <section class="flex flex-col gap-1.5">
          <BaseText variant="caption" tone="muted">
            Inject on {{ controls.target.value?.name ?? 'no UAV' }}
          </BaseText>
          <div class="grid grid-cols-3 gap-1.5">
            <BaseButton
              size="sm"
              :disabled="!controls.target.value"
              @click="controls.inject('lowBattery')"
            >
              Battery
            </BaseButton>
            <BaseButton
              size="sm"
              :disabled="!controls.target.value"
              @click="controls.inject('degradeSignal')"
            >
              Signal
            </BaseButton>
            <BaseButton
              size="sm"
              :disabled="!controls.target.value"
              @click="controls.inject('loseTelemetry')"
            >
              Telemetry
            </BaseButton>
          </div>
          <BaseButton
            size="sm"
            :disabled="!controls.target.value"
            @click="controls.inject('breachGeofence')"
          >
            No-fly zone breach
          </BaseButton>
          <div class="grid grid-cols-2 gap-1.5">
            <BaseButton size="sm" @click="controls.networkOutage()">Network outage</BaseButton>
            <BaseButton size="sm" variant="primary" @click="controls.restoreAll()">
              Restore all
            </BaseButton>
          </div>
        </section>

        <section class="flex flex-col gap-1.5">
          <BaseText variant="caption" tone="muted">Simulation</BaseText>
          <div class="flex items-center justify-between gap-2">
            <BaseSegmentedControl
              :model-value="controls.selectedTimeScale.value"
              label="Time scale"
              :options="controls.timeScaleOptions"
              @update:model-value="controls.setTimeScale"
            />
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <BaseButton size="sm" @click="controls.completeMission()">Complete mission</BaseButton>
            <BaseButton size="sm" variant="ghost" @click="controls.reset()">Reset</BaseButton>
          </div>
        </section>

        <BaseAlert
          v-if="controls.lastError.value"
          variant="warning"
          :title="controls.lastError.value"
        />

        <BaseDivider />
        <DemoDiagnostics :rows="controls.diagnosticsRows" />
      </BaseSurface>
    </Transition>

    <BaseSurface variant="floating" shape="pill" class="pointer-events-auto p-1">
      <BaseButton size="sm" variant="ghost" :aria-expanded="open" @click="open = !open">
        <FlaskConical />
        Demo
      </BaseButton>
    </BaseSurface>
  </div>
</template>

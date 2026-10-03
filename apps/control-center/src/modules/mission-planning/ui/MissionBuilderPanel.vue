<script setup lang="ts">
import { Undo2, X } from '@lucide/vue'
import {
  BaseAlert,
  BaseButton,
  BaseDivider,
  BaseIconButton,
  BaseInput,
  BaseMetric,
  BaseText,
} from '@horizon/ui'
import { computed } from 'vue'
import { formatDuration } from '@/shared/lib/format'
import { ALTITUDE_RANGE, injectMissionBuilder, type BuilderStep } from '../model/useMissionBuilder'

const builder = injectMissionBuilder()

const steps: { id: BuilderStep; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'area', label: 'Area' },
  { id: 'review', label: 'Review' },
]
const stepIndex = computed(() => steps.findIndex((s) => s.id === builder.step.value))

// Number inputs come back as strings when cleared; keep the model numeric.
const altitude = computed({
  get: () => builder.altitude.value,
  set: (value: string | number | undefined) => {
    builder.altitude.value = Number(value)
  },
})
const uavCount = computed({
  get: () => builder.uavCount.value,
  set: (value: string | number | undefined) => {
    builder.uavCount.value = Number(value)
  },
})
</script>

<template>
  <section class="flex min-h-0 flex-col" aria-labelledby="mission-builder-title">
    <header class="flex flex-col gap-3 px-4 pt-4 pb-3">
      <div class="flex items-center justify-between">
        <BaseText id="mission-builder-title" as="h2" variant="heading-md">New Area Scan</BaseText>
        <BaseIconButton size="sm" label="Cancel mission planning" @click="builder.close()">
          <X />
        </BaseIconButton>
      </div>
      <ol class="flex gap-1" aria-label="Steps">
        <li
          v-for="(item, index) in steps"
          :key="item.id"
          class="flex flex-1 flex-col gap-1"
          :aria-current="index === stepIndex ? 'step' : undefined"
        >
          <span
            class="h-1 rounded-full"
            :class="index <= stepIndex ? 'bg-action-primary' : 'bg-fill-strong'"
          />
          <BaseText variant="caption" :tone="index === stepIndex ? 'primary' : 'muted'">
            {{ index + 1 }} · {{ item.label }}
          </BaseText>
        </li>
      </ol>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
      <!-- 1. Details -->
      <template v-if="builder.step.value === 'details'">
        <BaseInput v-model="builder.name.value" label="Mission name" />
        <div class="grid grid-cols-2 gap-3">
          <BaseInput
            v-model="altitude"
            type="number"
            label="Altitude (m AGL)"
            :min="ALTITUDE_RANGE.min"
            :max="ALTITUDE_RANGE.max"
          />
          <BaseInput
            v-model="uavCount"
            type="number"
            label="UAVs"
            :hint="`${builder.availableUavs.value} available`"
            :min="1"
            :max="builder.availableUavs.value"
          />
        </div>
        <BaseAlert
          v-if="builder.detailErrors.value.length > 0"
          variant="warning"
          :title="builder.detailErrors.value[0] ?? ''"
        />
        <BaseButton
          variant="primary"
          block
          :disabled="builder.detailErrors.value.length > 0"
          @click="builder.next()"
        >
          Continue
        </BaseButton>
      </template>

      <!-- 2. Area -->
      <template v-else-if="builder.step.value === 'area'">
        <BaseText as="p" variant="body-md" tone="secondary">
          Click the map to place the corners of the scan area.
        </BaseText>
        <div class="flex items-center justify-between">
          <BaseText variant="label-lg" numeric>{{ builder.area.value.length }} points</BaseText>
          <div class="flex gap-1">
            <BaseButton
              size="sm"
              variant="ghost"
              :disabled="builder.area.value.length === 0"
              @click="builder.undoPoint()"
            >
              <Undo2 />
              Undo
            </BaseButton>
            <BaseButton
              size="sm"
              variant="ghost"
              :disabled="builder.area.value.length === 0"
              @click="builder.clearArea()"
            >
              Clear
            </BaseButton>
          </div>
        </div>
        <BaseAlert v-if="builder.error.value" variant="danger" :title="builder.error.value" />
        <div class="flex gap-2">
          <BaseButton class="flex-1" @click="builder.back()">Back</BaseButton>
          <BaseButton
            variant="primary"
            class="flex-1"
            :disabled="!builder.areaReady.value || builder.busy.value"
            @click="builder.generate()"
          >
            {{ builder.busy.value ? 'Planning…' : 'Generate plan' }}
          </BaseButton>
        </div>
      </template>

      <!-- 3. Review -->
      <template v-else-if="builder.summary.value">
        <div class="grid grid-cols-2 gap-x-3 gap-y-4">
          <BaseMetric label="UAVs" :value="builder.summary.value.uavCount" />
          <BaseMetric label="Waypoints" :value="builder.summary.value.waypoints" />
          <BaseMetric
            label="Total distance"
            :value="builder.summary.value.distanceKm.toFixed(1)"
            unit="km"
          />
          <BaseMetric
            label="Est. duration"
            :value="formatDuration(builder.summary.value.durationSec)"
          />
        </div>
        <BaseDivider />
        <ul class="flex flex-col gap-1.5" aria-label="Routes">
          <li
            v-for="route in builder.summary.value.routes"
            :key="route.uavId"
            class="flex items-center justify-between"
          >
            <BaseText variant="label-md">{{ route.uavId.toUpperCase() }}</BaseText>
            <BaseText variant="body-sm" tone="secondary" numeric>
              {{ route.waypoints }} wp · {{ route.distanceKm.toFixed(1) }} km
            </BaseText>
          </li>
        </ul>
        <BaseAlert v-if="builder.error.value" variant="danger" :title="builder.error.value" />
        <div class="flex gap-2">
          <BaseButton class="flex-1" :disabled="builder.busy.value" @click="builder.back()">
            Back
          </BaseButton>
          <BaseButton
            variant="primary"
            class="flex-1"
            :disabled="builder.busy.value"
            @click="builder.launch()"
          >
            {{ builder.busy.value ? 'Launching…' : 'Launch mission' }}
          </BaseButton>
        </div>
      </template>
    </div>
  </section>
</template>

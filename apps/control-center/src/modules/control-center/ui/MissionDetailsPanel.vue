<script setup lang="ts">
import { BaseProgress, BaseText } from '@horizon/ui'
import type { InspectorMission } from '@/modules/fleet'

defineProps<{
  /** Each mission UAV's phase, progress, ETA and battery on landing. */
  uavs: (InspectorMission & { uavId: string; uavName: string })[]
}>()

const emit = defineEmits<{ inspect: [uavId: string] }>()
</script>

<template>
  <ul class="flex flex-col overflow-y-auto p-1.5" aria-label="Mission UAVs">
    <li v-for="uav in uavs" :key="uav.uavId">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-fill"
        @click="emit('inspect', uav.uavId)"
      >
        <BaseText variant="label-md" class="w-16 shrink-0" truncate>{{ uav.uavName }}</BaseText>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <BaseText variant="caption" :tone="uav.tone" truncate>{{ uav.phase }}</BaseText>
          <BaseProgress
            v-if="uav.ratio !== null"
            :label="`${uav.uavName} mission progress`"
            :value="uav.ratio"
          />
        </div>
        <div class="flex w-28 shrink-0 flex-col items-end">
          <BaseText variant="caption" tone="secondary" numeric truncate>
            {{ uav.eta ?? '' }}
          </BaseText>
          <BaseText
            v-if="uav.landingBattery"
            variant="caption"
            :tone="uav.landingBattery.tone"
            numeric
          >
            {{ uav.landingBattery.label }} at landing
          </BaseText>
        </div>
      </button>
    </li>
  </ul>
</template>

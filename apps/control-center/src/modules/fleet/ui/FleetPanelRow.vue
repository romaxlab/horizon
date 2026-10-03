<script setup lang="ts">
import { BaseBadge, BaseText } from '@horizon/ui'
import type { FleetRow } from '../model/useFleetPanel'

// A separate component so unchanged rows (same object) skip re-rendering on telemetry flushes.
defineProps<{ row: FleetRow }>()
const emit = defineEmits<{ select: [uavId: string] }>()
</script>

<template>
  <button
    type="button"
    :aria-pressed="row.selected"
    class="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-fill aria-pressed:bg-fill-strong"
    @click="emit('select', row.id)"
  >
    <span class="flex min-w-0 flex-1 flex-col">
      <BaseText variant="label-lg" truncate>{{ row.name }}</BaseText>
      <BaseText variant="caption" tone="muted" truncate>
        {{ row.lastSeen ? `Last seen ${row.lastSeen}` : row.model }}
      </BaseText>
    </span>
    <BaseBadge :variant="row.status.variant" appearance="plain" class="w-16">
      {{ row.status.label }}
    </BaseBadge>
    <BaseText
      variant="body-md"
      :tone="row.batteryLow ? 'danger' : 'secondary'"
      numeric
      class="w-10 text-right"
    >
      {{ row.battery }}
    </BaseText>
  </button>
</template>

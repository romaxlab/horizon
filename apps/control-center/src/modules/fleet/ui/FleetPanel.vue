<script setup lang="ts">
import { PanelLeftClose } from '@lucide/vue'
import { BaseBadge, BaseIconButton, BaseInput, BaseSegmentedControl, BaseText } from '@horizon/ui'
import { useFleetPanel } from '../model/useFleetPanel'

const emit = defineEmits<{ select: [uavId: string]; collapse: [] }>()

const { query, filter, filterOptions, rows, isLoading } = useFleetPanel()
</script>

<template>
  <section class="flex min-h-0 flex-col" aria-labelledby="fleet-panel-title">
    <header class="flex flex-col gap-2.5 px-4 pt-4 pb-2">
      <div class="flex items-center justify-between">
        <BaseText id="fleet-panel-title" as="h2" variant="heading-md">Fleet</BaseText>
        <BaseIconButton size="sm" label="Collapse fleet panel" @click="emit('collapse')">
          <PanelLeftClose />
        </BaseIconButton>
      </div>
      <BaseInput
        v-model="query"
        type="search"
        label="Search UAVs"
        hide-label
        placeholder="Search"
      />
      <BaseSegmentedControl
        v-model="filter"
        label="Filter by status"
        :options="filterOptions"
        block
      />
    </header>

    <BaseText v-if="isLoading" as="p" variant="body-md" tone="muted" class="px-4 pt-1 pb-4">
      Loading fleet…
    </BaseText>
    <BaseText
      v-else-if="rows.length === 0"
      as="p"
      variant="body-md"
      tone="muted"
      class="px-4 pt-1 pb-4"
    >
      No UAVs match.
    </BaseText>
    <ul v-else class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <li v-for="row in rows" :key="row.id">
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
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { PanelLeftClose } from '@lucide/vue'
import { BaseIconButton, BaseInput, BaseSegmentedControl, BaseText } from '@horizon/ui'
import { useFleetPanel } from '../model/useFleetPanel'
import FleetPanelRow from './FleetPanelRow.vue'

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
        <FleetPanelRow :row="row" @select="emit('select', $event)" />
      </li>
    </ul>
  </section>
</template>

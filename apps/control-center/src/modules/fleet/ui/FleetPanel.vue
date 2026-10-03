<script setup lang="ts">
import { PanelLeftClose } from '@lucide/vue'
import { BaseIconButton, BaseInput, BaseSegmentedControl, BaseText } from '@horizon/ui'
import { computed, ref, useTemplateRef } from 'vue'
import { useFleetPanel } from '../model/useFleetPanel'
import FleetPanelRow from './FleetPanelRow.vue'

const emit = defineEmits<{ select: [uavId: string]; collapse: [] }>()

const { query, filter, filterOptions, rows, isLoading } = useFleetPanel()

// Roving tabindex (local presentation state): the last focused row, else the selected/first one.
const list = useTemplateRef<HTMLUListElement>('list')
const focusedId = ref<string | null>(null)
const tabbableId = computed(() => {
  const ids = rows.value.map((r) => r.id)
  if (focusedId.value && ids.includes(focusedId.value)) return focusedId.value
  return rows.value.find((r) => r.selected)?.id ?? ids[0] ?? null
})

function onListFocus(event: FocusEvent) {
  const id = (event.target as HTMLElement).dataset.rowId
  if (id) focusedId.value = id
}

function onListKeydown(event: KeyboardEvent) {
  const buttons = [...(list.value?.querySelectorAll<HTMLButtonElement>('[data-row-id]') ?? [])]
  const index = buttons.findIndex((b) => b === document.activeElement)
  const target =
    event.key === 'ArrowDown'
      ? buttons[Math.min(index + 1, buttons.length - 1)]
      : event.key === 'ArrowUp'
        ? buttons[Math.max(index - 1, 0)]
        : event.key === 'Home'
          ? buttons[0]
          : event.key === 'End'
            ? buttons.at(-1)
            : undefined
  if (!target) return
  event.preventDefault()
  target.focus()
}
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
    <!-- One Tab stop for the whole list; arrow keys move between UAVs. -->
    <ul
      v-else
      ref="list"
      class="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      @keydown="onListKeydown"
      @focusin="onListFocus"
    >
      <li v-for="row in rows" :key="row.id">
        <FleetPanelRow
          :row="row"
          :tabbable="row.id === tabbableId"
          @select="emit('select', $event)"
        />
      </li>
    </ul>
  </section>
</template>

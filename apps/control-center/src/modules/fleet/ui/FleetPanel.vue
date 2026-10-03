<script setup lang="ts">
import { BaseBadge, BaseText } from '@horizon/ui'
import { useFleetPanel } from '../model/useFleetPanel'

const { rows, summary, isLoading } = useFleetPanel()
</script>

<template>
  <section class="flex min-h-0 flex-col" aria-labelledby="fleet-panel-title">
    <header class="flex items-baseline justify-between px-4 pt-4 pb-2">
      <BaseText id="fleet-panel-title" as="h2" variant="heading-md">Fleet</BaseText>
      <BaseText variant="body-sm" tone="muted" numeric>
        {{ summary.active }} active · {{ summary.standby }} standby
      </BaseText>
    </header>

    <BaseText v-if="isLoading" as="p" variant="body-md" tone="muted" class="px-4 pt-1 pb-4">
      Loading fleet…
    </BaseText>
    <ul v-else class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <li
        v-for="row in rows"
        :key="row.id"
        class="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-fill"
      >
        <div class="flex min-w-0 flex-1 flex-col">
          <BaseText variant="label-lg" truncate>{{ row.name }}</BaseText>
          <BaseText variant="caption" tone="muted" truncate>{{ row.model }}</BaseText>
        </div>
        <BaseBadge :variant="row.status.variant" appearance="plain" class="w-16">
          {{ row.status.label }}
        </BaseBadge>
        <BaseText variant="body-md" tone="secondary" numeric class="w-10 text-right">
          {{ row.battery }}
        </BaseText>
      </li>
    </ul>
  </section>
</template>

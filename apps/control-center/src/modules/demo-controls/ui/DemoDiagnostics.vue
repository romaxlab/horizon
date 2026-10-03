<script setup lang="ts">
import { BaseText } from '@horizon/ui'
import type { Ref } from 'vue'

// Receives the ref itself, so only this component (not the panel) re-renders every second.
defineProps<{ rows: Readonly<Ref<{ label: string; value: string }[]>> }>()
</script>

<template>
  <dl class="grid grid-cols-2 gap-x-3 gap-y-1">
    <template v-for="row in rows.value" :key="row.label">
      <BaseText as="dt" variant="caption" tone="muted">{{ row.label }}</BaseText>
      <BaseText as="dd" variant="body-sm" numeric class="text-right">{{ row.value }}</BaseText>
    </template>
  </dl>
</template>

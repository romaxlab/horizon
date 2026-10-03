<script setup lang="ts">
import { useTheme } from '@horizon/ui'
import { computed } from 'vue'
import logoForDarkUi from './horizon-logo-dark.svg'
import logoForLightUi from './horizon-logo.svg'

/*
 * Approved Horizon logo (symbol + outlined wordmark). The SVGs include about half a
 * symbol-height of clear space, so the visible artwork is roughly half the rendered height:
 * h-8 (32px) shows ~16px artwork, sized for the compact floating header. Never crop or recolor.
 */
const { theme } = useTheme()
const src = computed(() => (theme.value === 'dark' ? logoForDarkUi : logoForLightUi))
</script>

<template>
  <img :src="src" alt="Horizon" class="h-8 w-auto shrink-0 select-none" draggable="false" />
</template>

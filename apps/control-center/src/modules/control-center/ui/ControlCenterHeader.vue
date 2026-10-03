<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
import { BaseBadge, BaseIconButton, BaseSurface, BaseText, useTheme } from '@horizon/ui'
import type { BadgeVariant } from '@horizon/ui'
import { HorizonLogo } from '@/shared/brand'

defineProps<{
  connection: { label: string; variant: BadgeVariant }
  clock: string
  missionTitle: string
}>()

const { theme, toggleTheme } = useTheme()
</script>

<template>
  <header class="flex items-start justify-between gap-3">
    <BaseSurface
      variant="floating"
      shape="pill"
      class="pointer-events-auto flex h-10 min-w-0 items-center gap-1.5 pr-4 pl-2"
    >
      <!-- The logo carries its own clear space (~8px each side), hence the tight padding. -->
      <HorizonLogo />
      <BaseText variant="body-md" tone="muted" truncate>{{ missionTitle }}</BaseText>
    </BaseSurface>

    <BaseSurface
      variant="floating"
      shape="pill"
      class="pointer-events-auto flex h-10 shrink-0 items-center gap-3 pr-1 pl-3"
    >
      <BaseBadge :variant="connection.variant" aria-live="polite">
        {{ connection.label }}
      </BaseBadge>
      <BaseText variant="body-md" tone="secondary" numeric>
        <time>{{ clock }}</time>
      </BaseText>
      <BaseIconButton
        :label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggleTheme"
      >
        <Sun v-if="theme === 'dark'" />
        <Moon v-else />
      </BaseIconButton>
    </BaseSurface>
  </header>
</template>

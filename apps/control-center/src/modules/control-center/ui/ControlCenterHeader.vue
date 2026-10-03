<script setup lang="ts">
import { Bell, Moon, Plus, Sun } from '@lucide/vue'
import { BaseBadge, BaseButton, BaseIconButton, BaseSurface, BaseText, useTheme } from '@horizon/ui'
import type { BadgeVariant } from '@horizon/ui'
import { HorizonLogo } from '@/shared/brand'

defineProps<{
  connection: { label: string; variant: BadgeVariant }
  clock: string
  /** Active mission name; null hides the mission context. */
  missionTitle: string | null
  missionContext: string
  canCreateMission: boolean
  /** New events since the history was last viewed. */
  unreadCount: number
  /** Whether any unread event is a warning/critical alert. */
  unreadAlerts: boolean
  eventsOpen: boolean
}>()

const emit = defineEmits<{ newMission: []; toggleEvents: [] }>()

const { theme, toggleTheme } = useTheme()
</script>

<template>
  <header class="flex items-start justify-between gap-3">
    <BaseSurface
      variant="floating"
      shape="pill"
      class="pointer-events-auto flex h-10 min-w-0 items-center gap-1.5 pr-1 pl-2"
    >
      <!-- The logo carries its own clear space (~8px each side), hence the tight padding. -->
      <HorizonLogo />
      <template v-if="missionTitle">
        <BaseText variant="body-md" truncate>{{ missionTitle }}</BaseText>
        <BaseBadge variant="info">{{ missionContext }}</BaseBadge>
      </template>
      <BaseButton
        size="sm"
        variant="primary"
        class="ml-2"
        :disabled="!canCreateMission"
        @click="emit('newMission')"
      >
        <Plus />
        New Mission
      </BaseButton>
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
        :label="unreadCount > 0 ? `Events, ${unreadCount} new` : 'Events'"
        :pressed="eventsOpen"
        class="relative"
        @click="emit('toggleEvents')"
      >
        <Bell />
        <span
          v-if="unreadCount > 0"
          class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-label-sm ring-2 ring-surface"
          :class="
            unreadAlerts
              ? 'bg-status-danger text-text-inverse'
              : 'bg-action-primary text-action-primary-text'
          "
          aria-hidden="true"
        >
          {{ unreadCount > 9 ? '9+' : unreadCount }}
        </span>
      </BaseIconButton>
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

<script setup lang="ts">
import { Bell, Moon, Plus, Sun } from '@lucide/vue'
import {
  BaseBadge,
  BaseButton,
  BaseIconButton,
  BasePopover,
  BaseSurface,
  BaseText,
  useTheme,
} from '@horizon/ui'
import type { BadgeVariant } from '@horizon/ui'
import { computed } from 'vue'
import { HorizonLogo } from '@/shared/brand'
import { useNow } from '@/shared/lib/useNow'

defineProps<{
  connection: { label: string; variant: BadgeVariant }
  /** Active mission name; null hides the mission context. */
  missionTitle: string | null
  canCreateMission: boolean
  /** New events since the history was last viewed. */
  unreadCount: number
  /** Whether any unread event is a warning/critical alert. */
  unreadAlerts: boolean
}>()

const emit = defineEmits<{ newMission: [] }>()

/** Event history popover, anchored to the bell. */
const eventsOpen = defineModel<boolean>('eventsOpen', { required: true })

defineSlots<{
  /** Event history content, provided by the composing view. */
  events: () => unknown
}>()

const { theme, toggleTheme } = useTheme()

// The clock ticks here, so only the header updates every second, not the whole view.
const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZoneName: 'short',
})
const now = useNow()
const clock = computed(() => clockFormat.format(now.value))
</script>

<template>
  <header class="flex items-start justify-between gap-3">
    <BaseSurface
      variant="floating"
      shape="pill"
      class="pointer-events-auto flex h-10 min-w-0 items-center gap-1.5 pl-2"
      :class="canCreateMission ? 'pr-1' : 'pr-3'"
    >
      <!-- The logo carries its own clear space (~8px each side), hence the tight padding. -->
      <HorizonLogo />
      <template v-if="missionTitle">
        <!-- Progress lives in the mission status bar; the header only names the mission. -->
        <BaseText variant="body-md" truncate>{{ missionTitle }}</BaseText>
      </template>
      <!-- Shown only when a mission can be created; a disabled primary button read as a stray
           blue blot on glass. During a mission the header names it instead. -->
      <!-- Narrow screens (below lg): icon only, named by aria-label and the native title tooltip. -->
      <BaseButton
        v-if="canCreateMission"
        size="sm"
        variant="primary"
        class="ml-2 max-lg:size-control-sm max-lg:px-0"
        aria-label="New Mission"
        title="New Mission"
        @click="emit('newMission')"
      >
        <Plus />
        <span class="max-lg:hidden">New Mission</span>
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
      <BasePopover
        id="event-history"
        v-model:open="eventsOpen"
        label="Event history"
        align="end"
        panel-class="flex w-80 flex-col overflow-hidden"
        max-height="24rem"
      >
        <template #trigger="{ toggle, triggerAttrs }">
          <BaseIconButton
            :label="unreadCount > 0 ? `Events, ${unreadCount} new` : 'Events'"
            v-bind="triggerAttrs"
            class="relative"
            @click="toggle"
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
        </template>
        <slot name="events" />
      </BasePopover>
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

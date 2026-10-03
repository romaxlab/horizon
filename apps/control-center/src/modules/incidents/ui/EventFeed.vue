<script setup lang="ts">
import { X } from '@lucide/vue'
import { BaseBadge, BaseButton, BaseIconButton, BaseText, type BadgeVariant } from '@horizon/ui'

defineProps<{
  events: {
    id: string
    uavId: string | null
    time: string
    title: string
    subject: string
    variant: BadgeVariant
    resolved: boolean
  }[]
}>()

const emit = defineEmits<{ inspect: [uavId: string]; close: []; clear: [] }>()
</script>

<template>
  <section class="flex min-h-0 flex-col" aria-labelledby="event-feed-title">
    <header class="flex items-center justify-between px-4 pt-4 pb-2">
      <BaseText id="event-feed-title" as="h2" variant="heading-md">Events</BaseText>
      <div class="flex items-center gap-1">
        <BaseButton
          size="sm"
          variant="ghost"
          :disabled="events.length === 0"
          @click="emit('clear')"
        >
          Clear
        </BaseButton>
        <BaseIconButton size="sm" label="Close events" @click="emit('close')">
          <X />
        </BaseIconButton>
      </div>
    </header>
    <BaseText v-if="events.length === 0" as="p" variant="body-md" tone="muted" class="px-4 pb-4">
      No events yet.
    </BaseText>
    <ol v-else class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <li v-for="event in events" :key="event.id">
        <component
          :is="event.uavId ? 'button' : 'div'"
          :type="event.uavId ? 'button' : undefined"
          class="flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left"
          :class="{ 'transition-colors hover:bg-fill': event.uavId }"
          @click="event.uavId && emit('inspect', event.uavId)"
        >
          <BaseText variant="caption" tone="muted" numeric class="pt-0.5">{{
            event.time
          }}</BaseText>
          <span class="flex min-w-0 flex-1 flex-col">
            <BaseBadge :variant="event.variant" appearance="plain">
              {{ event.title }}{{ event.resolved ? ' · resolved' : '' }}
            </BaseBadge>
            <BaseText v-if="event.subject" variant="body-sm" tone="secondary" truncate>
              {{ event.subject }}
            </BaseText>
          </span>
        </component>
      </li>
    </ol>
  </section>
</template>

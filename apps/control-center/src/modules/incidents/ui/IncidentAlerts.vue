<script setup lang="ts">
import { X } from '@lucide/vue'
import { BaseAlert, BaseButton, BaseIconButton, BaseText, type AlertVariant } from '@horizon/ui'

defineProps<{
  alerts: {
    id: string
    uavId: string | null
    title: string
    subject: string
    variant: AlertVariant
  }[]
  hiddenCount: number
}>()

const emit = defineEmits<{ inspect: [id: string, uavId: string]; dismiss: [id: string] }>()
</script>

<template>
  <div class="flex w-96 flex-col gap-2" aria-live="assertive" aria-label="Alerts">
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <BaseAlert
        v-for="alert in alerts"
        :key="alert.id"
        :variant="alert.variant"
        :title="alert.title"
        class="pointer-events-auto"
      >
        {{ alert.subject }}
        <template #actions>
          <!-- Same action on every alert; severity reads from the dot and the title color. -->
          <BaseButton
            v-if="alert.uavId"
            size="sm"
            variant="secondary"
            @click="emit('inspect', alert.id, alert.uavId)"
          >
            Inspect
          </BaseButton>
          <BaseIconButton size="sm" label="Dismiss alert" @click="emit('dismiss', alert.id)">
            <X />
          </BaseIconButton>
        </template>
      </BaseAlert>
    </TransitionGroup>
    <BaseText v-if="hiddenCount > 0" variant="caption" tone="muted" class="self-center">
      +{{ hiddenCount }} more in events
    </BaseText>
  </div>
</template>

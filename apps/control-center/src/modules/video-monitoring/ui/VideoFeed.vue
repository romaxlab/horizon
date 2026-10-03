<script setup lang="ts">
import { Maximize2, X } from '@lucide/vue'
import { BaseButton, BaseIconButton } from '@horizon/ui'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRef, watch } from 'vue'
import { createSyntheticFeed, type SyntheticFeed } from '../lib/synthetic-feed'
import { useVideoFeed } from '../model/useVideoFeed'
import type { FeedPose, LinkState } from '../model/video.types'

const props = defineProps<{
  uavId: string
  /** Display name for the HUD. */
  label: string
  pose: FeedPose | null
  link: LinkState
  /** `preview` sits in the inspector; `focus` is the large floating view. */
  variant?: 'preview' | 'focus'
}>()

const emit = defineEmits<{ expand: []; close: [] }>()

const linkLabel: Record<LinkState, string> = {
  live: 'LINK OK',
  stale: 'LINK DEGRADED',
  offline: 'LINK LOST',
}

const { source, state, retry } = useVideoFeed(toRef(props, 'uavId'), toRef(props, 'link'))

const canvas = ref<HTMLCanvasElement>()
const feed = shallowRef<SyntheticFeed>()
const imageryReady = ref(false)

// (Re)create the renderer when the source or the canvas changes; failures stay inside the feed.
watch(
  [source, canvas],
  ([next, element]) => {
    feed.value?.destroy()
    feed.value = undefined
    imageryReady.value = false
    if (!next || !element) return
    const created = createSyntheticFeed(element, next)
    feed.value = created
    void created.ready.then(() => {
      if (feed.value === created) imageryReady.value = true
    })
  },
  { flush: 'post' },
)

watch(
  [() => props.pose, feed],
  ([pose, current]) => {
    if (pose && current) current.setPose(pose)
  },
  { immediate: true },
)
watch([state, feed], ([next, current]) => current?.setFrozen(next === 'frozen'), {
  immediate: true,
})

onBeforeUnmount(() => feed.value?.destroy())

// In focus mode Escape closes the video first (before the inspector's own Escape handling).
function onKeydown(event: KeyboardEvent) {
  if (props.variant !== 'focus' || event.key !== 'Escape') return
  event.stopImmediatePropagation()
  emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown, { capture: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, { capture: true })
})

const showsImagery = computed(() => state.value === 'live' || state.value === 'frozen')
const hud = computed(() => {
  const pose = props.pose
  if (!pose) return null
  return {
    altitude: `ALT ${pose.altitude.toFixed(0)} m`,
    speed: `SPD ${pose.speed.toFixed(1)} m/s`,
    heading: `HDG ${pose.heading.toFixed(0).padStart(3, '0')}°`,
  }
})
const message = computed(() => {
  switch (state.value) {
    case 'loading':
      return 'Connecting to camera…'
    case 'unavailable':
      return props.link === 'offline' ? 'No video · UAV offline' : 'No camera feed'
    case 'error':
      return 'Video unavailable'
    default:
      return null
  }
})
</script>

<template>
  <figure
    class="video-feed relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-media text-caption text-on-media select-none"
    :aria-label="`${label} camera feed, simulated`"
  >
    <canvas
      v-show="showsImagery"
      ref="canvas"
      class="video-feed__canvas absolute inset-0 size-full"
      :class="{ 'video-feed__canvas--frozen': state === 'frozen' }"
      aria-hidden="true"
    />

    <template v-if="showsImagery">
      <div class="video-feed__vignette pointer-events-none absolute inset-0" />
      <!-- Center crosshair -->
      <svg
        class="pointer-events-none absolute top-1/2 left-1/2 size-8 -translate-1/2 text-on-media-muted"
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <path
          d="M16 4v8M16 20v8M4 16h8M20 16h8"
          stroke="currentColor"
          stroke-width="1.25"
          stroke-linecap="round"
          fill="none"
        />
        <circle cx="16" cy="16" r="1.25" fill="currentColor" />
      </svg>

      <div
        class="video-feed__hud absolute flex items-start justify-between gap-2"
        :class="variant === 'focus' ? 'inset-x-4 top-3' : 'inset-x-2.5 top-2'"
      >
        <span :class="variant === 'focus' ? 'text-heading-sm' : 'text-label-md'">{{ label }}</span>
        <span class="flex items-center gap-1.5">
          <span v-if="variant === 'focus'" class="rounded-sm bg-media-scrim px-1.5 text-label-sm">
            {{ linkLabel[link] }}
          </span>
          <span class="rounded-sm bg-media-scrim px-1.5 text-label-sm">SIMULATED FEED</span>
          <BaseIconButton
            v-if="variant === 'focus'"
            size="sm"
            label="Close video"
            variant="media"
            class="-my-1"
            @click="emit('close')"
          >
            <X />
          </BaseIconButton>
        </span>
      </div>
      <div
        v-if="hud"
        class="video-feed__hud absolute flex justify-between gap-2 tabular-nums"
        :class="variant === 'focus' ? 'inset-x-4 bottom-3 text-label-lg' : 'inset-x-2.5 bottom-2'"
      >
        <span>{{ hud.altitude }}</span>
        <span>{{ hud.speed }}</span>
        <span>{{ hud.heading }}</span>
      </div>

      <div
        v-if="state === 'frozen'"
        class="absolute inset-0 grid place-items-center bg-media-scrim"
        role="status"
      >
        <span class="text-label-md">Signal degraded · frame frozen</span>
      </div>
      <div v-else-if="!imageryReady" class="absolute inset-0 grid place-items-center" role="status">
        <span class="text-on-media-muted">Acquiring imagery…</span>
      </div>
    </template>

    <div
      v-else
      class="absolute inset-0 flex flex-col items-center justify-center gap-2"
      role="status"
    >
      <span class="text-label-md text-on-media-muted">{{ message }}</span>
      <BaseButton v-if="state === 'error'" size="sm" variant="secondary" @click="retry()">
        Retry
      </BaseButton>
      <BaseButton v-if="variant === 'focus'" size="sm" variant="ghost" @click="emit('close')">
        Close
      </BaseButton>
    </div>

    <BaseIconButton
      v-if="variant !== 'focus'"
      size="sm"
      label="Expand video"
      variant="media"
      class="absolute top-7 right-1.5"
      @click="emit('expand')"
    >
      <Maximize2 />
    </BaseIconButton>

    <figcaption class="sr-only">Simulated camera feed for {{ label }}</figcaption>
  </figure>
</template>

<style scoped>
/* Onboard-camera treatment: slightly darker and punchier than the map imagery. */
.video-feed__canvas {
  filter: contrast(1.12) saturate(0.82) brightness(0.88);
}
.video-feed__canvas--frozen {
  filter: grayscale(0.6) contrast(1.05) brightness(0.7);
}
.video-feed__vignette {
  background: var(--media-vignette);
}
.video-feed__hud {
  text-shadow: var(--media-text-shadow);
}
</style>

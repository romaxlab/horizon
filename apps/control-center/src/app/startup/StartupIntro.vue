<script setup lang="ts">
import { useDismissLayer } from '@horizon/ui'
import { computed } from 'vue'
import logo from '@/shared/brand/horizon-logo-dark.svg'
import { STARTUP_STATUS_LINES } from './startup-timeline'
import { useStartupSequence } from './useStartupSequence'
import './startup-reveal.css'

const { timeline, phase, statusShown, statusConfirmed, skipped, skip } = useStartupSequence()

// Escape skips; the intro is the top layer while it runs.
useDismissLayer(
  computed(() => phase.value !== 'done' && !skipped.value),
  skip,
)

const ms = (value: number) => `${String(value)}ms`
/** Timeline values for the overlay's CSS (see startup-timeline.ts). */
const timing = computed(() => ({
  '--logo-at': ms(timeline.logo.at),
  '--logo-duration': ms(timeline.logo.duration),
  '--title-at': ms(timeline.title.at),
  '--title-duration': ms(timeline.title.duration),
  '--status-duration': ms(timeline.status.duration),
  '--leave-duration': ms(skipped.value ? timeline.skip.duration : timeline.dissolve.duration),
  '--ease-enter': timeline.easing.enter,
  '--ease-dissolve': timeline.easing.dissolve,
}))
</script>

<template>
  <Transition leave-active-class="startup-leave" leave-to-class="startup-leave-to">
    <div
      v-if="phase === 'intro'"
      class="startup fixed inset-0 z-50 grid place-items-center bg-media text-on-media select-none"
      :style="timing"
      aria-label="Horizon is starting"
      aria-busy="true"
    >
      <div class="startup-stack flex flex-col items-center">
        <!-- The artwork carries its own clear space: h-28 shows a ~56px symbol and wordmark. -->
        <img :src="logo" alt="Horizon" class="startup-logo h-28 w-auto" draggable="false" />
        <div class="startup-horizon h-px w-56 bg-on-media/25" aria-hidden="true" />
        <p class="startup-title mt-4 text-overline text-on-media-muted uppercase">
          Autonomous Mission Control
        </p>

        <ol class="mt-12 flex w-64 flex-col gap-2 font-mono text-caption" role="status">
          <li
            v-for="(line, index) in STARTUP_STATUS_LINES"
            :key="line"
            class="startup-status flex items-baseline gap-2"
            :class="{ 'is-shown': index < statusShown }"
          >
            <span class="text-on-media-muted">{{ line }}</span>
            <span class="flex-1 border-b border-dotted border-on-media/20" aria-hidden="true" />
            <span
              class="startup-check w-6 text-right"
              :class="
                index < statusConfirmed ? 'is-confirmed text-status-success' : 'text-on-media-muted'
              "
            >
              {{ index < statusConfirmed ? 'OK' : '···' }}
            </span>
          </li>
        </ol>
      </div>

      <button
        type="button"
        class="startup-skip absolute right-6 bottom-6 flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-label-md text-on-media-muted transition-colors hover:text-on-media focus-visible:outline-2 focus-visible:outline-border-focus"
        @click="skip"
      >
        Skip intro
        <kbd class="rounded-sm border border-on-media/25 px-1 font-mono text-caption">Esc</kbd>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.startup {
  background-image: var(--media-glow);
}

/* Entrances run on the timeline from mount; `both` holds the start state until the delay. */
.startup-logo {
  animation: startup-resolve var(--logo-duration) var(--ease-enter) var(--logo-at) both;
}
.startup-horizon {
  animation: startup-horizon var(--title-duration) var(--ease-enter) var(--title-at) both;
}
.startup-title,
.startup-skip {
  animation: startup-rise var(--title-duration) var(--ease-enter) var(--title-at) both;
}

.startup-status {
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity var(--status-duration) var(--ease-enter),
    transform var(--status-duration) var(--ease-enter);
}
.startup-status.is-shown {
  opacity: 1;
  transform: none;
}
.startup-check.is-confirmed {
  animation: startup-confirm var(--status-duration) var(--ease-enter) both;
}

/* Dissolve: the overlay fades into the map while its content drifts forward and defocuses. */
.startup-leave {
  transition: opacity var(--leave-duration) var(--ease-dissolve);
}
.startup-leave .startup-stack {
  transition:
    transform var(--leave-duration) var(--ease-dissolve),
    filter var(--leave-duration) var(--ease-dissolve);
}
.startup-leave-to {
  opacity: 0;
}
.startup-leave-to .startup-stack {
  transform: scale(1.06);
  filter: blur(10px);
}

@keyframes startup-resolve {
  from {
    opacity: 0;
    transform: scale(0.96);
    filter: blur(12px);
  }
  to {
    opacity: 1;
    transform: none;
    filter: blur(0);
  }
}
@keyframes startup-horizon {
  from {
    opacity: 0;
    transform: scaleX(0);
  }
  to {
    opacity: 1;
    transform: scaleX(1);
  }
}
@keyframes startup-rise {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes startup-confirm {
  from {
    opacity: 0.4;
  }
  to {
    opacity: 1;
  }
}
@keyframes startup-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Reduced motion: the same sequence as plain cross-fades; nothing scales, travels or blurs. */
@media (prefers-reduced-motion: reduce) {
  .startup-logo,
  .startup-horizon,
  .startup-title,
  .startup-skip {
    animation-name: startup-fade;
  }
  .startup-status {
    transform: none;
  }
  .startup-leave-to .startup-stack {
    transform: none;
    filter: none;
  }
}
</style>

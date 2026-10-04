<script setup lang="ts">
/*
 * Indeterminate activity indicator: a thin ring with a rotating arc in the current text color.
 * Use only where no real progress is known. Reduced motion: the ring pulses instead of turning.
 */
const { label, size = 'md' } = defineProps<{
  /** Announced to assistive technology, e.g. "Loading map". */
  label: string
  size?: 'sm' | 'md'
}>()
</script>

<template>
  <svg
    role="img"
    :aria-label="label"
    viewBox="0 0 16 16"
    fill="none"
    class="base-spinner shrink-0"
    :class="size === 'sm' ? 'size-3.5' : 'size-4'"
  >
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-opacity="0.2" stroke-width="1.5" />
    <path
      d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
</template>

<style scoped>
.base-spinner {
  animation: base-spinner-turn 0.9s linear infinite;
}
@keyframes base-spinner-turn {
  to {
    transform: rotate(360deg);
  }
}
@keyframes base-spinner-pulse {
  50% {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .base-spinner {
    animation: base-spinner-pulse 1.6s ease-in-out infinite;
  }
}
</style>

<script setup lang="ts">
const { orientation = 'horizontal' } = defineProps<{
  orientation?: 'horizontal' | 'vertical'
}>()
</script>

<template>
  <div
    role="separator"
    :aria-orientation="orientation"
    :class="
      orientation === 'horizontal'
        ? 'h-px w-full shrink-0 bg-border-subtle'
        : 'w-px self-stretch bg-border-subtle'
    "
  />
</template>

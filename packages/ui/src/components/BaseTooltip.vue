<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue'

export type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left'

const { text, placement = 'top' } = defineProps<{
  /** Short explanation; empty text disables the tooltip. */
  text: string
  placement?: TooltipPlacement
}>()

defineSlots<{ default: () => unknown }>()
// Layout classes from the caller go to the trigger wrapper, not the teleported bubble.
defineOptions({ inheritAttrs: false })

/** Hover intent: avoid flicker when the pointer just passes over a control. */
const SHOW_DELAY_MS = 350
const GAP_PX = 8

const id = useId()
const trigger = useTemplateRef<HTMLElement>('trigger')
const open = ref(false)
const anchor = ref({ x: 0, y: 0 })
let timer: ReturnType<typeof setTimeout> | undefined

function place() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  anchor.value = {
    top: { x: rect.left + rect.width / 2, y: rect.top - GAP_PX },
    bottom: { x: rect.left + rect.width / 2, y: rect.bottom + GAP_PX },
    left: { x: rect.left - GAP_PX, y: rect.top + rect.height / 2 },
    right: { x: rect.right + GAP_PX, y: rect.top + rect.height / 2 },
  }[placement]
}

function show(delay = SHOW_DELAY_MS) {
  if (!text) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    place()
    open.value = true
  }, delay)
}
function hide() {
  clearTimeout(timer)
  open.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}

// Positioned against the viewport and teleported, so scrolling or clipping containers never cut it.
const style = computed(() => ({
  left: `${anchor.value.x}px`,
  top: `${anchor.value.y}px`,
  transform: {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  }[placement],
}))

// The slotted control is described by the tooltip for assistive technology.
onMounted(() => {
  trigger.value
    ?.querySelector('button, a, input, select, textarea, [tabindex]')
    ?.setAttribute('aria-describedby', id)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
})
</script>

<template>
  <div
    ref="trigger"
    v-bind="$attrs"
    @mouseenter="show()"
    @mouseleave="hide"
    @focusin="show(0)"
    @focusout="hide"
    @keydown="onKeydown"
  >
    <slot />
  </div>
  <Teleport to="body">
    <div
      v-show="open"
      :id="id"
      role="tooltip"
      :style="style"
      class="pointer-events-none fixed z-50 w-max max-w-64 rounded-md bg-surface-raised px-2.5 py-1.5 text-caption text-text-primary shadow-floating"
    >
      {{ text }}
    </div>
  </Teleport>
</template>

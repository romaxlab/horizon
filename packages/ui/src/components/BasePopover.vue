<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import BaseSurface from './BaseSurface.vue'

export type PopoverPlacement = 'top' | 'bottom'
export type PopoverAlign = 'start' | 'center' | 'end'

const {
  id,
  label,
  placement = 'bottom',
  align = 'start',
  panelClass = '',
  maxHeight = '100vh',
} = defineProps<{
  /** Panel id; the trigger points at it with `aria-controls` (see `triggerAttrs`). */
  id: string
  /** Accessible name of the panel. */
  label: string
  placement?: PopoverPlacement
  align?: PopoverAlign
  /** Layout of the panel content (width, padding); scroll behavior when the height is capped. */
  panelClass?: string
  /** Preferred maximum height (CSS length); the panel is also capped to the room on screen. */
  maxHeight?: string
}>()

const open = defineModel<boolean>('open', { required: true })

defineSlots<{
  /** Anchor; bind `triggerAttrs` and call `toggle` on the control that opens the popover. */
  trigger(props: {
    open: boolean
    toggle: () => void
    triggerAttrs: { 'aria-expanded': boolean; 'aria-controls': string; 'aria-haspopup': 'dialog' }
  }): unknown
  default(props: { close: () => void }): unknown
}>()

// Layout classes from the caller go to the anchor wrapper, not the teleported panel.
defineOptions({ inheritAttrs: false })

/** Distance between anchor and panel (CSS px), the regular gap between floating surfaces. */
const GAP_PX = 12
/** Room kept between the panel and the viewport edge (CSS px). */
const EDGE_PX = 12

const anchor = useTemplateRef<HTMLElement>('anchor')
const panel = ref<{ $el: HTMLElement } | null>(null)
const rect = ref<DOMRect | null>(null)

function close() {
  open.value = false
}
function toggle() {
  open.value = !open.value
}

function measure() {
  rect.value = anchor.value?.getBoundingClientRect() ?? null
}

/**
 * Teleported and positioned against the viewport: a panel nested in a glass surface would only
 * blur that surface (a backdrop-filter element is the backdrop root of its children), and a
 * container could clip it.
 */
const style = computed(() => {
  const r = rect.value
  if (!r) return {}
  const vertical =
    placement === 'top'
      ? { bottom: `${String(window.innerHeight - r.top + GAP_PX)}px` }
      : { top: `${String(r.bottom + GAP_PX)}px` }
  const horizontal =
    align === 'start'
      ? { left: `${String(r.left)}px` }
      : align === 'end'
        ? { right: `${String(window.innerWidth - r.right)}px` }
        : { left: `${String(r.left + r.width / 2)}px`, transform: 'translateX(-50%)' }
  // Never taller than the space on its side of the anchor: short screens scroll the panel.
  const room =
    placement === 'top'
      ? r.top - GAP_PX - EDGE_PX
      : window.innerHeight - r.bottom - GAP_PX - EDGE_PX
  return {
    ...vertical,
    ...horizontal,
    maxHeight: `min(${maxHeight}, ${String(Math.max(0, room))}px)`,
    // Never wider than the screen minus the edge room (phones).
    maxWidth: `calc(100vw - ${String(EDGE_PX * 2)}px)`,
  }
})

// Close on Escape (focus back on the trigger) and on a press outside anchor and panel.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  // Escape closes the popover only, not surfaces behind it (e.g. the inspector).
  event.stopPropagation()
  close()
  anchor.value
    ?.querySelector<HTMLElement>(`[aria-controls="${id}"]`)
    ?.focus({ preventScroll: true })
}
function onPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (anchor.value?.contains(target) || panel.value?.$el.contains(target)) return
  close()
}

// The anchor can move or resize while open (e.g. a status line whose text changes).
let observer: ResizeObserver | null = null
function listen(active: boolean) {
  observer?.disconnect()
  observer = null
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('resize', measure)
  if (!active) return
  measure()
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('resize', measure)
  if (anchor.value) {
    observer = new ResizeObserver(measure)
    observer.observe(anchor.value)
  }
}
watch(open, listen, { immediate: true })
onBeforeUnmount(() => {
  listen(false)
})

const triggerAttrs = computed(() => ({
  'aria-expanded': open.value,
  'aria-controls': id,
  'aria-haspopup': 'dialog' as const,
}))
</script>

<template>
  <div ref="anchor" v-bind="$attrs">
    <slot name="trigger" :open="open" :toggle="toggle" :trigger-attrs="triggerAttrs" />
  </div>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      :enter-from-class="
        placement === 'top' ? 'translate-y-1 opacity-0' : '-translate-y-1 opacity-0'
      "
      leave-active-class="transition duration-150 ease-in"
      :leave-to-class="placement === 'top' ? 'translate-y-1 opacity-0' : '-translate-y-1 opacity-0'"
    >
      <BaseSurface
        v-if="open"
        :id="id"
        ref="panel"
        variant="floating"
        role="dialog"
        :aria-label="label"
        class="fixed z-40"
        :class="panelClass"
        :style="style"
      >
        <slot :close="close" />
      </BaseSurface>
    </Transition>
  </Teleport>
</template>

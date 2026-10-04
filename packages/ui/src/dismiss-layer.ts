import { onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * Escape dismisses one layer at a time, topmost first: a popover over the video focus view over
 * the inspector. Layers register while active; the most recently activated one is on top.
 * One document listener serves them all, so dismissal never depends on listener order.
 */
interface DismissLayer {
  dismiss: () => void
}

const stack: DismissLayer[] = []

const isEditable = (target: EventTarget | null): target is HTMLElement =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

function onKeydown(event: KeyboardEvent) {
  const top = stack.at(-1)
  if (event.key !== 'Escape' || event.defaultPrevented || !top) return
  event.preventDefault()
  // In a text field Escape only leaves the field; a second Escape dismisses the layer.
  if (isEditable(event.target)) {
    event.target.blur()
    return
  }
  top.dismiss()
}

function remove(layer: DismissLayer) {
  const index = stack.indexOf(layer)
  if (index !== -1) stack.splice(index, 1)
  if (stack.length === 0) document.removeEventListener('keydown', onKeydown)
}

function push(layer: DismissLayer) {
  remove(layer)
  if (stack.length === 0) document.addEventListener('keydown', onKeydown)
  stack.push(layer)
}

/** Registers a surface that Escape closes while `active` is true. */
export function useDismissLayer(active: Readonly<Ref<boolean>>, dismiss: () => void) {
  const layer: DismissLayer = { dismiss }
  watch(
    active,
    (on) => {
      if (on) push(layer)
      else remove(layer)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    remove(layer)
  })
}

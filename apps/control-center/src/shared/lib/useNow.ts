import { onBeforeUnmount, ref, type Ref } from 'vue'

/** Current epoch ms, refreshed every `intervalMs` while the calling component is mounted. */
export function useNow(intervalMs = 1000): Readonly<Ref<number>> {
  const now = ref(Date.now())
  const timer = setInterval(() => {
    now.value = Date.now()
  }, intervalMs)
  onBeforeUnmount(() => {
    clearInterval(timer)
  })
  return now
}

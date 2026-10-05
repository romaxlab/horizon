/** Whether the page is in a background tab, where browsers throttle timers and pause frames. */
export interface PageVisibility {
  hidden(): boolean
  subscribe(listener: (hidden: boolean) => void): () => void
}

export const documentVisibility: PageVisibility = {
  hidden: () => document.visibilityState === 'hidden',
  subscribe(listener) {
    const onChange = () => {
      listener(document.visibilityState === 'hidden')
    }
    document.addEventListener('visibilitychange', onChange)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
    }
  },
}

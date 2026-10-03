import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { useAppServices } from '@/app/providers/services'
import { deriveFeedState } from './feed-state'
import type { LinkState } from './video.types'

/** Resolves the selected UAV's video source and derives the feed state. */
export function useVideoFeed(uavId: Readonly<Ref<string>>, link: Readonly<Ref<LinkState>>) {
  const { videoProvider } = useAppServices()

  const query = useQuery({
    queryKey: computed(() => ['video-source', uavId.value] as const),
    queryFn: () => videoProvider.getSource(uavId.value),
    staleTime: Infinity,
    retry: 1,
  })

  const state = computed(() =>
    deriveFeedState({
      status: query.status.value,
      available: query.data.value != null,
      link: link.value,
    }),
  )

  return { source: computed(() => query.data.value ?? null), state, retry: () => query.refetch() }
}

import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { videoQueryKeys } from '../api/video.queries'
import { deriveFeedState } from './feed-state'
import { videoProviderSlot, type LinkState } from './video.types'

/** Resolves the selected UAV's video source and derives the feed state. */
export function useVideoFeed(uavId: Readonly<Ref<string>>, link: Readonly<Ref<LinkState>>) {
  const videoProvider = videoProviderSlot.use()

  const query = useQuery({
    queryKey: computed(() => videoQueryKeys.source(uavId.value)),
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

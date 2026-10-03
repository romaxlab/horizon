import { QueryClient } from '@tanstack/vue-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Live state comes from the realtime pipeline; avoid refetch storms on focus.
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
    },
  })
}

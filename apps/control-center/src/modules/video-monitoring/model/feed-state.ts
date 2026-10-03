import type { FeedState, LinkState } from './video.types'

/**
 * Feed state from the source lookup and the UAV link. A stale link freezes the last frame;
 * an offline UAV or a UAV without a camera has no feed. Video failure never affects telemetry.
 */
export function deriveFeedState(source: {
  status: 'pending' | 'error' | 'success'
  available: boolean
  link: LinkState
}): FeedState {
  if (source.link === 'offline') return 'unavailable'
  if (source.status === 'pending') return 'loading'
  if (source.status === 'error') return 'error'
  if (!source.available) return 'unavailable'
  return source.link === 'stale' ? 'frozen' : 'live'
}

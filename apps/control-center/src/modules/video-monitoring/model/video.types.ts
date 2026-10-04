import { defineServiceSlot } from '@/shared/lib/service-slot'

/**
 * A UAV video source. `synthetic-imagery` renders a simulated nadir camera from satellite tiles
 * under the UAV; real streams (HLS/WebRTC) would be added as further kinds behind the same contract.
 */
export type VideoSource = {
  kind: 'synthetic-imagery'
  /** XYZ tile template with `{z}`, `{x}`, `{y}`. */
  tileUrlTemplate: string
  maxZoom: number
  attribution: string
}

/** Video boundary. Mock and remote implementations share this contract. */
export interface VideoProvider {
  /** Null when the UAV has no camera feed. */
  getSource(uavId: string): Promise<VideoSource | null>
}

/** Camera pose and flight data driving the feed and its HUD. */
export interface FeedPose {
  latitude: number
  longitude: number
  /** Meters above ground. */
  altitude: number
  /** Degrees clockwise from north. */
  heading: number
  /** m/s */
  speed: number
  /** Source time of the telemetry sample, epoch ms. */
  timestamp: number
  /** Local time the sample was received, epoch ms. */
  receivedAt: number
}

export type LinkState = 'live' | 'stale' | 'offline'

export type FeedState = 'loading' | 'live' | 'frozen' | 'unavailable' | 'error'

/** The VideoProvider implementation chosen at bootstrap (mock or remote). */
export const videoProviderSlot = defineServiceSlot<VideoProvider>('VideoProvider')

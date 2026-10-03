import { z } from 'zod'
import { HttpError, type HttpClient } from '@/shared/http'
import type { VideoProvider, VideoSource } from '../model/video.types'

const videoSourceDtoSchema = z.object({
  kind: z.literal('synthetic-imagery'),
  tile_url_template: z.string().includes('{z}').includes('{x}').includes('{y}'),
  max_zoom: z.number().int().min(0).max(24),
  attribution: z.string(),
})

/** `GET /uavs/{id}/video` → video source; 404 or an empty body means no camera feed. */
export function createRemoteVideoProvider(http: HttpClient): VideoProvider {
  return {
    async getSource(uavId): Promise<VideoSource | null> {
      let payload: unknown
      try {
        payload = await http.get(`uavs/${encodeURIComponent(uavId)}/video`)
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) return null
        throw error
      }
      if (payload === null) return null
      const dto = videoSourceDtoSchema.parse(payload)
      return {
        kind: dto.kind,
        tileUrlTemplate: dto.tile_url_template,
        maxZoom: dto.max_zoom,
        attribution: dto.attribution,
      }
    },
  }
}

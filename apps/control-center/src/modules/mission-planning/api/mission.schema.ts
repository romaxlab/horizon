import { z } from 'zod'

const geoPoint = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })

export const missionDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.literal('area_scan'),
  status: z.enum(['planned', 'active', 'completed', 'aborted']),
  area: z.object({ polygon: z.array(geoPoint).min(3) }),
  altitude_m: z.number().positive(),
  assigned_uav_ids: z.array(z.string()),
  routes: z.array(
    z.object({
      uav_id: z.string(),
      waypoints: z.array(
        z.object({
          id: z.string(),
          lat: z.number(),
          lon: z.number(),
          alt_m: z.number(),
          order: z.number().int().nonnegative(),
        }),
      ),
      distance_m: z.number().nonnegative(),
      eta_s: z.number().nonnegative(),
    }),
  ),
  created_at: z.number(),
  started_at: z.number().nullable(),
  completed_at: z.number().nullable(),
})

export const missionMessageSchema = z.object({ type: z.literal('mission'), data: missionDtoSchema })

export type MissionDto = z.infer<typeof missionDtoSchema>

import { z } from 'zod'

const geoPoint = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })

export const geofencesDtoSchema = z.array(
  z.object({ id: z.string().min(1), name: z.string(), polygon: z.array(geoPoint).min(3) }),
)

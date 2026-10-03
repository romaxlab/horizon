import { z } from 'zod'

const latitude = z.number().min(-90).max(90)
const longitude = z.number().min(-180).max(180)
const percent = z.number().min(0).max(100)

export const uavDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  model: z.string(),
  callsign: z.string(),
  has_camera: z.boolean(),
  has_thermal_camera: z.boolean(),
})

export const telemetryDtoSchema = z.object({
  uav_id: z.string().min(1),
  ts: z.number().int().nonnegative(),
  lat: latitude,
  lon: longitude,
  alt_m: z.number(),
  speed_mps: z.number().nonnegative(),
  heading_deg: z.number().min(0).max(360),
  battery_pct: percent,
  signal_pct: percent,
  gps_sats: z.number().int().nonnegative(),
  mission_id: z.string().nullable(),
  waypoint_index: z.number().int().nonnegative().nullable(),
})

export const fleetSnapshotDtoSchema = z.object({
  server_time: z.number(),
  uavs: z.array(uavDtoSchema),
  telemetry: z.array(telemetryDtoSchema),
})

/** Realtime messages this module understands; other message types are ignored by it. */
export const fleetRealtimeMessageSchema = z.object({
  type: z.literal('telemetry'),
  data: telemetryDtoSchema,
})

export type UavDto = z.infer<typeof uavDtoSchema>
export type TelemetryDto = z.infer<typeof telemetryDtoSchema>
export type FleetSnapshotDto = z.infer<typeof fleetSnapshotDtoSchema>

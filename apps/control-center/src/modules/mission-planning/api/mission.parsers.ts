import type { Mission } from '@horizon/domain'
import { z } from 'zod'
import { mapMission } from './mission.mapper'
import { missionDtoSchema, missionMessageSchema } from './mission.schema'

export class MissionPayloadError extends Error {
  override name = 'MissionPayloadError'
}

export function parseMission(payload: unknown): Mission {
  const result = missionDtoSchema.safeParse(payload)
  if (!result.success) {
    throw new MissionPayloadError(`Invalid mission: ${z.prettifyError(result.error)}`)
  }
  return mapMission(result.data)
}

/** Mission realtime message → domain mission; null for other message types or invalid data. */
export function parseMissionMessage(payload: unknown): Mission | null {
  // Classify cheaply first: telemetry dominates the stream and must not pay for mission parsing.
  if ((payload as { type?: unknown } | null)?.type !== 'mission') return null
  const result = missionMessageSchema.safeParse(payload)
  return result.success ? mapMission(result.data.data) : null
}

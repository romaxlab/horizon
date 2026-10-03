import type { UavTelemetry } from '@horizon/domain'
import { z } from 'zod'
import type { FleetSnapshot } from '../model/fleet.types'
import { mapFleetSnapshot, mapTelemetry } from './fleet.mapper'
import { fleetRealtimeMessageSchema, fleetSnapshotDtoSchema } from './fleet.schema'

export class FleetPayloadError extends Error {
  override name = 'FleetPayloadError'
}

/** Validates and maps a fleet snapshot payload. Throws on invalid data. */
export function parseFleetSnapshot(payload: unknown): FleetSnapshot {
  const result = fleetSnapshotDtoSchema.safeParse(payload)
  if (!result.success) {
    throw new FleetPayloadError(`Invalid fleet snapshot: ${z.prettifyError(result.error)}`)
  }
  return mapFleetSnapshot(result.data)
}

export type TelemetryMessageResult =
  | { kind: 'telemetry'; telemetry: UavTelemetry }
  /** Not a telemetry message; other consumers may handle it. */
  | { kind: 'other' }
  | { kind: 'invalid'; error: string }

const messageEnvelopeSchema = z.object({ type: z.string() })

/** Validates and maps a realtime telemetry message. */
export function parseTelemetryMessage(payload: unknown): TelemetryMessageResult {
  const envelope = messageEnvelopeSchema.safeParse(payload)
  if (!envelope.success) return { kind: 'invalid', error: 'Message has no type' }
  if (envelope.data.type !== 'telemetry') return { kind: 'other' }

  const result = fleetRealtimeMessageSchema.safeParse(payload)
  return result.success
    ? { kind: 'telemetry', telemetry: mapTelemetry(result.data.data) }
    : { kind: 'invalid', error: z.prettifyError(result.error) }
}

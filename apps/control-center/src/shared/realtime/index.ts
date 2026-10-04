import type { RealtimeTransport } from '@horizon/realtime'
import { defineServiceSlot } from '@/shared/lib/service-slot'

/** The one realtime stream, shared by the modules that consume it (fleet, missions). */
export const realtimeTransportSlot = defineServiceSlot<RealtimeTransport>('RealtimeTransport')

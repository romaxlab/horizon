export type TransportStatus = 'connecting' | 'open' | 'closed'

/**
 * Events delivered by a transport. Message payloads are raw wire data (`unknown`);
 * consumers validate them before use.
 */
export type RealtimeEvent =
  { type: 'message'; payload: unknown } | { type: 'status'; status: TransportStatus }

export interface RealtimeTransport {
  connect(): Promise<void>
  disconnect(): void
  subscribe(handler: (event: RealtimeEvent) => void): () => void
}

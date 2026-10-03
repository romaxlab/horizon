import { createWebSocketRealtimeTransport } from '@horizon/realtime'
import type { AppServices } from '@/app/providers/services'
import { createRestAirspaceRepository } from '@/modules/airspace'
import { createRestFleetRepository } from '@/modules/fleet'
import { createRemoteMissionPlanner } from '@/modules/mission-planning'
import { createRemoteVideoProvider } from '@/modules/video-monitoring'
import { createHttpClient } from '@/shared/http'

/**
 * Remote composition: REST + WebSocket backend behind the same contracts as the mock.
 * Flow: REST snapshot → WebSocket stream → on drop, fleet sync reconnects and resyncs.
 */
export function createRemoteServices(endpoints: { apiUrl: string; wsUrl: string }): AppServices {
  const http = createHttpClient({ baseUrl: endpoints.apiUrl })
  return {
    fleetRepository: createRestFleetRepository(http),
    realtimeTransport: createWebSocketRealtimeTransport({ url: endpoints.wsUrl }),
    missionPlanner: createRemoteMissionPlanner(http),
    airspaceRepository: createRestAirspaceRepository(http),
    videoProvider: createRemoteVideoProvider(http),
    // Demo controls drive the simulator and do not exist against a real backend.
    demoControl: null,
  }
}

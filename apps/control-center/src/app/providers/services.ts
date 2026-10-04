import type { RealtimeTransport } from '@horizon/realtime'
import type { App } from 'vue'
import { airspaceRepositorySlot, type AirspaceRepository } from '@/modules/airspace'
import { demoControlSlot, type DemoControl } from '@/modules/demo-controls'
import { fleetRepositorySlot, type FleetRepository } from '@/modules/fleet'
import { missionPlannerSlot, type MissionPlanner } from '@/modules/mission-planning'
import { videoProviderSlot, type VideoProvider } from '@/modules/video-monitoring'
import { realtimeTransportSlot } from '@/shared/realtime'

/**
 * The infrastructure one composition (mock or remote) provides. Chosen once at bootstrap; each
 * implementation goes into the slot its consuming module declares, so modules never depend on
 * the app layer.
 */
export interface AppServices {
  fleetRepository: FleetRepository
  realtimeTransport: RealtimeTransport
  missionPlanner: MissionPlanner
  airspaceRepository: AirspaceRepository
  videoProvider: VideoProvider
  /** Simulator demo controls; null unless the mock backend runs with demo controls enabled. */
  demoControl: DemoControl | null
}

export function provideAppServices(app: App, services: AppServices) {
  fleetRepositorySlot.provide(app, services.fleetRepository)
  realtimeTransportSlot.provide(app, services.realtimeTransport)
  missionPlannerSlot.provide(app, services.missionPlanner)
  airspaceRepositorySlot.provide(app, services.airspaceRepository)
  videoProviderSlot.provide(app, services.videoProvider)
  demoControlSlot.provide(app, services.demoControl)
}

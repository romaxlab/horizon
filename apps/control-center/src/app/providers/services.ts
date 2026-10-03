import type { RealtimeTransport } from '@horizon/realtime'
import { inject, type App, type InjectionKey } from 'vue'
import type { FleetRepository } from '@/modules/fleet'
import type { MissionPlanner } from '@/modules/mission-planning'

/** Infrastructure contracts consumed by modules. Concrete implementations are chosen at bootstrap. */
export interface AppServices {
  fleetRepository: FleetRepository
  realtimeTransport: RealtimeTransport
  missionPlanner: MissionPlanner
}

const appServicesKey: InjectionKey<AppServices> = Symbol('AppServices')

export function provideAppServices(app: App, services: AppServices) {
  app.provide(appServicesKey, services)
}

export function useAppServices(): AppServices {
  const services = inject(appServicesKey)
  if (!services) throw new Error('AppServices are not provided')
  return services
}

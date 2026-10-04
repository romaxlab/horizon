import { initTheme } from '@horizon/ui'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp, type App as VueApp } from 'vue'
import App from '@/app/App.vue'
import { createQueryClient } from '@/app/providers/query-client'
import { provideAppServices } from '@/app/providers/services'
import { router } from '@/app/router'
import { stageStartup } from '@/app/startup'
import type { AppServices } from '@/app/providers/services'
import type { AppConfig } from '@/shared/config'

/**
 * Loads only the selected composition: a remote build never downloads the simulator, demo data
 * and planners, and the mock build never loads the REST/WebSocket clients.
 */
async function createServices(config: AppConfig): Promise<AppServices> {
  if (config.dataSource.kind === 'remote') {
    const { createRemoteServices } = await import('./remote-services')
    return createRemoteServices(config.dataSource)
  }
  const { createMockServices } = await import('./mock-services')
  return createMockServices(config)
}

/** Composes the application once, before mounting. Concrete infrastructure is chosen here. */
export async function createHorizonApp(config: AppConfig): Promise<VueApp> {
  initTheme()

  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  // Before mounting: the panels start hidden and the map starts held for the intro.
  if (config.cinematicIntro) stageStartup(pinia)
  app.use(router)
  app.use(VueQueryPlugin, { queryClient: createQueryClient() })
  provideAppServices(app, await createServices(config))
  return app
}

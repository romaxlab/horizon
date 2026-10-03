import { initTheme } from '@horizon/ui'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp, type App as VueApp } from 'vue'
import App from '@/app/App.vue'
import { createQueryClient } from '@/app/providers/query-client'
import { provideAppServices } from '@/app/providers/services'
import { router } from '@/app/router'
import type { AppConfig } from '@/shared/config'
import { createMockServices } from './mock-services'
import { createRemoteServices } from './remote-services'

/** Composes the application once, before mounting. Concrete infrastructure is chosen here. */
export function createHorizonApp(config: AppConfig): VueApp {
  initTheme()

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(VueQueryPlugin, { queryClient: createQueryClient() })
  provideAppServices(
    app,
    config.dataSource.kind === 'remote'
      ? createRemoteServices(config.dataSource)
      : createMockServices(config),
  )
  return app
}

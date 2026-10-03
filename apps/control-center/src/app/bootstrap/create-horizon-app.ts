import { initTheme } from '@horizon/ui'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp, type App as VueApp } from 'vue'
import App from '@/app/App.vue'
import { createQueryClient } from '@/app/providers/query-client'
import { router } from '@/app/router'

/** Composes the application once, before mounting. */
export function createHorizonApp(): VueApp {
  initTheme()

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.use(VueQueryPlugin, { queryClient: createQueryClient() })
  return app
}

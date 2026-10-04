import '@fontsource-variable/inter'
import '@/app/styles/main.css'

/** Shown when the app cannot start (e.g. invalid configuration) instead of a blank page. */
function renderStartupError(error: unknown) {
  console.error('[horizon] failed to start', error)
  const root = document.getElementById('app')
  if (!root) return
  root.innerHTML = `
    <main class="grid h-full place-items-center p-8">
      <div class="flex max-w-lg flex-col gap-2">
        <h1 class="text-heading-lg text-text-primary">Horizon could not start</h1>
        <p class="text-body-md text-text-secondary">Check the application configuration and reload.</p>
        <pre class="overflow-auto rounded-md bg-fill p-3 text-caption whitespace-pre-wrap text-text-secondary"></pre>
      </div>
    </main>`
  const details = root.querySelector('pre')
  if (details) details.textContent = error instanceof Error ? error.message : String(error)
}

// Config is validated while modules load, so the bootstrap is imported dynamically to catch it.
import('@/app/bootstrap/create-horizon-app')
  .then(async ({ createHorizonApp }) => {
    const { appConfig } = await import('@/shared/config')
    const app = await createHorizonApp(appConfig)
    app.config.errorHandler = (error, _instance, info) => {
      console.error(`[horizon] unhandled error in ${info}`, error)
    }
    app.mount('#app')
  })
  .catch(renderStartupError)

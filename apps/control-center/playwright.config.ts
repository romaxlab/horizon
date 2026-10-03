import { defineConfig, devices } from '@playwright/test'

const PORT = 5273

/** Primary workflows against the mock backend (simulator) with demo controls enabled. */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/control-center`,
    reuseExistingServer: !process.env.CI,
    env: { VITE_DEMO_CONTROLS: 'true', VITE_DEMO_AUTOSTART: 'false' },
  },
})

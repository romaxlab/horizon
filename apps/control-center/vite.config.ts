/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumSource = 'node_modules/cesium/Build/Cesium'
// Cesium loads workers and assets at runtime from this public path.
const cesiumBaseUrl = 'cesium'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({
        src: `${cesiumSource}/${dir}`,
        dest: cesiumBaseUrl,
        // Drop `node_modules/cesium/Build/Cesium` so files land at `cesium/<dir>/…`.
        rename: { stripBase: 4 },
      })),
    }),
  ],
  build: {
    // Cesium is a single ~4 MB lazy chunk loaded only by the map; the app shell stays small.
    chunkSizeWarningLimit: 4_500,
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  // Unit tests live next to the code; Playwright specs in e2e/ run separately (`pnpm e2e`).
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

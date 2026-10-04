import { z } from 'zod'

const appConfigSchema = z
  .object({
    /**
     * Infrastructure composition: `mock` runs the in-browser simulator; `remote` talks to a backend
     * over REST (`VITE_API_URL`) and WebSocket (`VITE_WS_URL`) through the same contracts.
     */
    VITE_DATA_SOURCE: z.enum(['mock', 'remote']).default('mock'),
    VITE_API_URL: z.url({ protocol: /^https?$/ }).optional(),
    VITE_WS_URL: z.url({ protocol: /^wss?$/ }).optional(),
    /** Shows simulator demo controls (mock only). Defaults to on in development builds. */
    VITE_DEMO_CONTROLS: z.stringbool().optional(),
    /** Starts the prepared Area Scan demo mission on startup. */
    VITE_DEMO_AUTOSTART: z.stringbool().default(false),
    /** `deterministic` replays the same simulation every run; `random` varies it. */
    VITE_SIMULATOR_MODE: z.enum(['deterministic', 'random']).default('deterministic'),
    /**
     * Telemetry → state flush interval, ms. Incoming telemetry is coalesced per UAV between
     * flushes, so this caps state/UI update frequency independently of the message rate.
     */
    VITE_TELEMETRY_FLUSH_MS: z.coerce.number().int().min(16).max(1_000).default(100),
    /** Optional Cesium ion access token; enables the photorealistic 3D map view. */
    VITE_CESIUM_ION_TOKEN: z.string().trim().optional(),
    /** Plays the cinematic startup sequence; `false` opens the Control Center directly. */
    VITE_CINEMATIC_INTRO: z.stringbool().default(true),
  })
  .superRefine((env, ctx) => {
    if (env.VITE_DATA_SOURCE !== 'remote') return
    for (const key of ['VITE_API_URL', 'VITE_WS_URL'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'Required in remote mode' })
    }
  })

export type DataSourceConfig = { kind: 'mock' } | { kind: 'remote'; apiUrl: string; wsUrl: string }

export interface AppConfig {
  dataSource: DataSourceConfig
  demoControls: boolean
  demoAutostart: boolean
  simulatorMode: 'deterministic' | 'random'
  cesiumIonToken: string | null
  telemetryFlushMs: number
  cinematicIntro: boolean
}

export class AppConfigError extends Error {
  override name = 'AppConfigError'
}

/** The only place that reads raw environment variables. */
export function parseAppConfig(env: Record<string, unknown>, isDev: boolean): AppConfig {
  const result = appConfigSchema.safeParse(env)
  if (!result.success) {
    throw new AppConfigError(`Invalid application config:\n${z.prettifyError(result.error)}`)
  }
  const { VITE_DATA_SOURCE: kind, VITE_API_URL: apiUrl, VITE_WS_URL: wsUrl } = result.data
  const dataSource: DataSourceConfig =
    kind === 'remote' && apiUrl && wsUrl ? { kind, apiUrl, wsUrl } : { kind: 'mock' }
  return {
    dataSource,
    // Demo controls drive the simulator, so they only exist in mock mode.
    demoControls: dataSource.kind === 'mock' && (result.data.VITE_DEMO_CONTROLS ?? isDev),
    demoAutostart: result.data.VITE_DEMO_AUTOSTART,
    simulatorMode: result.data.VITE_SIMULATOR_MODE,
    cesiumIonToken: result.data.VITE_CESIUM_ION_TOKEN || null,
    telemetryFlushMs: result.data.VITE_TELEMETRY_FLUSH_MS,
    cinematicIntro: result.data.VITE_CINEMATIC_INTRO,
  }
}

export const appConfig: AppConfig = parseAppConfig(import.meta.env, import.meta.env.DEV)

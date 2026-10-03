import { z } from 'zod'

const appConfigSchema = z.object({
  /** Shows simulator demo controls. Defaults to on in development builds. */
  VITE_DEMO_CONTROLS: z.stringbool().optional(),
  /** Starts the prepared Area Scan demo mission on startup. */
  VITE_DEMO_AUTOSTART: z.stringbool().default(false),
  /** `deterministic` replays the same simulation every run; `random` varies it. */
  VITE_SIMULATOR_MODE: z.enum(['deterministic', 'random']).default('deterministic'),
})

export interface AppConfig {
  demoControls: boolean
  demoAutostart: boolean
  simulatorMode: 'deterministic' | 'random'
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
  return {
    demoControls: result.data.VITE_DEMO_CONTROLS ?? isDev,
    demoAutostart: result.data.VITE_DEMO_AUTOSTART,
    simulatorMode: result.data.VITE_SIMULATOR_MODE,
  }
}

export const appConfig: AppConfig = parseAppConfig(import.meta.env, import.meta.env.DEV)

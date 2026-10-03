import { describe, expect, it } from 'vitest'
import { AppConfigError, parseAppConfig } from './app-config'

describe('parseAppConfig', () => {
  it('applies defaults', () => {
    expect(parseAppConfig({}, true)).toEqual({
      demoControls: true,
      demoAutostart: false,
      simulatorMode: 'deterministic',
      cesiumIonToken: null,
      telemetryFlushMs: 100,
    })
    expect(parseAppConfig({}, false).demoControls).toBe(false)
  })

  it('reads explicit values', () => {
    expect(parseAppConfig({ VITE_DEMO_CONTROLS: 'false' }, true).demoControls).toBe(false)
    expect(parseAppConfig({ VITE_DEMO_CONTROLS: 'true' }, false).demoControls).toBe(true)
    expect(parseAppConfig({ VITE_DEMO_AUTOSTART: 'true' }, false).demoAutostart).toBe(true)
    expect(parseAppConfig({ VITE_SIMULATOR_MODE: 'random' }, false).simulatorMode).toBe('random')
    expect(parseAppConfig({ VITE_CESIUM_ION_TOKEN: ' abc ' }, false).cesiumIonToken).toBe('abc')
    expect(parseAppConfig({ VITE_CESIUM_ION_TOKEN: '' }, false).cesiumIonToken).toBeNull()
  })

  it('rejects invalid values', () => {
    expect(() => parseAppConfig({ VITE_DEMO_CONTROLS: 'maybe' }, true)).toThrow(AppConfigError)
    expect(() => parseAppConfig({ VITE_SIMULATOR_MODE: 'chaos' }, true)).toThrow(AppConfigError)
    expect(() => parseAppConfig({ VITE_TELEMETRY_FLUSH_MS: '5' }, true)).toThrow(AppConfigError)
  })
})

import { describe, expect, it } from 'vitest'
import { AppConfigError, parseAppConfig } from '../app-config'

describe('parseAppConfig', () => {
  it('applies defaults', () => {
    expect(parseAppConfig({}, true)).toEqual({
      dataSource: { kind: 'mock' },
      demoControls: true,
      demoAutostart: false,
      simulatorMode: 'deterministic',
      cesiumIonToken: null,
      telemetryFlushMs: 100,
      cinematicIntro: true,
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
    expect(parseAppConfig({ VITE_CINEMATIC_INTRO: 'false' }, false).cinematicIntro).toBe(false)
  })

  it('rejects invalid values', () => {
    expect(() => parseAppConfig({ VITE_DEMO_CONTROLS: 'maybe' }, true)).toThrow(AppConfigError)
    expect(() => parseAppConfig({ VITE_SIMULATOR_MODE: 'chaos' }, true)).toThrow(AppConfigError)
    expect(() => parseAppConfig({ VITE_TELEMETRY_FLUSH_MS: '5' }, true)).toThrow(AppConfigError)
  })

  it('selects the remote data source with validated endpoints', () => {
    const remote = parseAppConfig(
      {
        VITE_DATA_SOURCE: 'remote',
        VITE_API_URL: 'https://api.horizon.test/v1',
        VITE_WS_URL: 'wss://api.horizon.test/realtime',
        VITE_DEMO_CONTROLS: 'true',
      },
      true,
    )
    expect(remote.dataSource).toEqual({
      kind: 'remote',
      apiUrl: 'https://api.horizon.test/v1',
      wsUrl: 'wss://api.horizon.test/realtime',
    })
    expect(remote.demoControls).toBe(false)

    expect(() => parseAppConfig({ VITE_DATA_SOURCE: 'remote' }, true)).toThrow(AppConfigError)
    expect(() =>
      parseAppConfig(
        {
          VITE_DATA_SOURCE: 'remote',
          VITE_API_URL: 'https://x.test',
          VITE_WS_URL: 'https://x.test',
        },
        true,
      ),
    ).toThrow(AppConfigError)
  })
})

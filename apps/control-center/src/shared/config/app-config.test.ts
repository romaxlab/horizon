import { describe, expect, it } from 'vitest'
import { AppConfigError, parseAppConfig } from './app-config'

describe('parseAppConfig', () => {
  it('applies defaults', () => {
    expect(parseAppConfig({}, true)).toEqual({
      demoControls: true,
      demoAutostart: false,
      simulatorMode: 'deterministic',
    })
    expect(parseAppConfig({}, false).demoControls).toBe(false)
  })

  it('reads explicit values', () => {
    expect(parseAppConfig({ VITE_DEMO_CONTROLS: 'false' }, true).demoControls).toBe(false)
    expect(parseAppConfig({ VITE_DEMO_CONTROLS: 'true' }, false).demoControls).toBe(true)
    expect(parseAppConfig({ VITE_DEMO_AUTOSTART: 'true' }, false).demoAutostart).toBe(true)
    expect(parseAppConfig({ VITE_SIMULATOR_MODE: 'random' }, false).simulatorMode).toBe('random')
  })

  it('rejects invalid values', () => {
    expect(() => parseAppConfig({ VITE_DEMO_CONTROLS: 'maybe' }, true)).toThrow(AppConfigError)
    expect(() => parseAppConfig({ VITE_SIMULATOR_MODE: 'chaos' }, true)).toThrow(AppConfigError)
  })
})

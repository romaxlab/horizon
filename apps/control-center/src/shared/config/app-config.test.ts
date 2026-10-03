import { describe, expect, it } from 'vitest'
import { AppConfigError, parseAppConfig } from './app-config'

describe('parseAppConfig', () => {
  it('applies defaults', () => {
    expect(parseAppConfig({}, true)).toEqual({ demoControls: true })
    expect(parseAppConfig({}, false)).toEqual({ demoControls: false })
  })

  it('reads explicit values', () => {
    expect(parseAppConfig({ VITE_DEMO_CONTROLS: 'false' }, true).demoControls).toBe(false)
    expect(parseAppConfig({ VITE_DEMO_CONTROLS: 'true' }, false).demoControls).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(() => parseAppConfig({ VITE_DEMO_CONTROLS: 'maybe' }, true)).toThrow(AppConfigError)
  })
})

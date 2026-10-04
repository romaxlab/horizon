import { inject, type App, type InjectionKey } from 'vue'

/**
 * A typed dependency a module needs from the composition root. The module that consumes the
 * dependency declares the slot next to its contract; bootstrap fills it. Dependencies so point
 * from the app into modules, never back.
 */
export interface ServiceSlot<T> {
  provide(app: App, value: T): void
  /** Inside setup (or an app context); throws when the composition root never filled the slot. */
  use(): T
}

const missing = Symbol('missing')

export function defineServiceSlot<T>(name: string): ServiceSlot<T> {
  const key: InjectionKey<T> = Symbol(name)
  return {
    provide(app, value) {
      app.provide(key, value)
    },
    use() {
      const value = inject<T | typeof missing>(key, missing)
      if (value === missing) throw new Error(`${name} is not provided`)
      return value
    },
  }
}

import { computed, type ComputedRef } from 'vue'

/** Shallow equality of plain objects (own enumerable keys, strict value comparison). */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a) as (keyof T)[]
  return keysA.length === Object.keys(b).length && keysA.every((key) => a[key] === b[key])
}

/**
 * A computed that keeps returning the previous object while it is equal to the new one, so
 * dependents (and components) don't update on every high-frequency source change.
 */
export function stableComputed<T>(
  getter: () => T,
  isEqual: (previous: T, next: T) => boolean,
): ComputedRef<T> {
  return computed((previous?: T) => {
    const next = getter()
    return previous !== undefined && isEqual(previous, next) ? previous : next
  })
}

export interface LatestStateBufferOptions<T> {
  keyOf: (item: T) => string
  /** Monotonic version such as a timestamp or sequence number. */
  versionOf: (item: T) => number
}

export interface LatestStateBuffer<T> {
  /** Keeps the item if it is newer than anything accepted for its key. Returns false otherwise. */
  push(item: T): boolean
  /** Returns and clears the pending latest item per key. */
  drain(): T[]
  /** Marks `version` as already applied for `key` (e.g. from a snapshot); drops older pending items. */
  setBaseline(key: string, version: number): void
  /** Forgets all versions and pending items. */
  clear(): void
  readonly pendingCount: number
}

/**
 * Coalesces a high-frequency stream into the latest state per key and rejects
 * out-of-order or duplicate updates.
 */
export function createLatestStateBuffer<T>({
  keyOf,
  versionOf,
}: LatestStateBufferOptions<T>): LatestStateBuffer<T> {
  const accepted = new Map<string, number>()
  let pending = new Map<string, T>()

  return {
    push(item) {
      const key = keyOf(item)
      const version = versionOf(item)
      const last = accepted.get(key)
      if (last !== undefined && version <= last) return false
      accepted.set(key, version)
      pending.set(key, item)
      return true
    },
    drain() {
      const items = [...pending.values()]
      pending = new Map()
      return items
    },
    setBaseline(key, version) {
      const last = accepted.get(key)
      if (last !== undefined && last > version) return
      accepted.set(key, version)
      pending.delete(key)
    },
    clear() {
      accepted.clear()
      pending.clear()
    },
    get pendingCount() {
      return pending.size
    },
  }
}

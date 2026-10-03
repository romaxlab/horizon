export interface ScreenPoint {
  id: string
  x: number
  y: number
  /**
   * Points sharing a group start as one cluster, e.g. a parking formation that should aggregate
   * or split as a whole rather than in arbitrary blocks.
   */
  group?: string
}

export interface ScreenCluster {
  /** Stable key: the smallest member id. */
  key: string
  memberIds: string[]
}

/** Groups that were together keep merging until they drift this much further apart. */
const STICKINESS = 1.25

interface Group {
  key: string
  x: number
  y: number
  memberIds: string[]
}

/**
 * Agglomerative screen-space clustering: repeatedly merges the two closest groups (by centroid)
 * while they are closer than `threshold` pixels. Splits therefore follow the natural gaps in the
 * data as the camera zooms, and when it finishes every pair of groups is at least `threshold`
 * apart, so badges up to that size never overlap.
 *
 * Deterministic for the same input; `previous` membership (id → cluster key) adds hysteresis so
 * moving markers don't flicker in and out of a cluster at the boundary.
 */
export function clusterScreenPoints(
  points: readonly ScreenPoint[],
  threshold: number,
  previous: ReadonlyMap<string, string> = new Map(),
): ScreenCluster[] {
  const groups: Group[] = []
  const byGroupKey = new Map<string, Group>()
  for (const { id, x, y, group } of [...points].sort((a, b) => a.id.localeCompare(b.id))) {
    const existing = group === undefined ? undefined : byGroupKey.get(group)
    if (existing) {
      const count = existing.memberIds.length
      existing.x = (existing.x * count + x) / (count + 1)
      existing.y = (existing.y * count + y) / (count + 1)
      existing.memberIds.push(id)
      continue
    }
    const created: Group = { key: id, x, y, memberIds: [id] }
    groups.push(created)
    if (group !== undefined) byGroupKey.set(group, created)
  }

  const wereTogether = (a: Group, b: Group) =>
    a.memberIds.some((m) => {
      const key = previous.get(m)
      return key !== undefined && b.memberIds.some((n) => previous.get(n) === key)
    })

  for (;;) {
    let bestI = -1
    let bestJ = -1
    let bestDistance = Infinity
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i]
        const b = groups[j]
        if (!a || !b) continue
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        const limit = wereTogether(a, b) ? threshold * STICKINESS : threshold
        if (distance < limit && distance < bestDistance) {
          bestDistance = distance
          bestI = i
          bestJ = j
        }
      }
    }
    const a = groups[bestI]
    const b = groups[bestJ]
    if (!a || !b) break

    const total = a.memberIds.length + b.memberIds.length
    a.x = (a.x * a.memberIds.length + b.x * b.memberIds.length) / total
    a.y = (a.y * a.memberIds.length + b.y * b.memberIds.length) / total
    a.memberIds = [...a.memberIds, ...b.memberIds].sort((p, q) => p.localeCompare(q))
    a.key = a.memberIds[0] ?? a.key
    groups.splice(bestJ, 1)
  }

  return groups.map(({ key, memberIds }) => ({ key, memberIds }))
}

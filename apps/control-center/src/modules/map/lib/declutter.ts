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
  /** Clusters its members belonged to last time (hysteresis). */
  previousKeys: Set<string>
  /** Position in id order: ties merge in the same order as a full pairwise scan would. */
  order: number
  /** Bumped on every merge; queued pairs from an older version are stale. */
  version: number
  alive: boolean
}

interface Candidate {
  distance: number
  a: Group
  b: Group
  aVersion: number
  bVersion: number
}

/** Min-heap of candidate pairs: closest first, ties by id order (deterministic). */
class CandidateHeap {
  private items: Candidate[] = []
  private before(p: Candidate, q: Candidate) {
    if (p.distance !== q.distance) return p.distance < q.distance
    if (p.a.order !== q.a.order) return p.a.order < q.a.order
    return p.b.order < q.b.order
  }
  push(item: Candidate) {
    const items = this.items
    items.push(item)
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      const [child, up] = [items[i], items[parent]]
      if (!child || !up || !this.before(child, up)) break
      items[i] = up
      items[parent] = child
      i = parent
    }
  }
  pop(): Candidate | undefined {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (!last || items.length === 0) return top
    items[0] = last
    let i = 0
    for (;;) {
      let best = i
      for (const child of [2 * i + 1, 2 * i + 2]) {
        const candidate = items[child]
        const current = items[best]
        if (candidate && current && this.before(candidate, current)) best = child
      }
      if (best === i) return top
      const [parent, swap] = [items[i], items[best]]
      if (!parent || !swap) return top
      items[i] = swap
      items[best] = parent
      i = best
    }
  }
}

/** Uniform grid over screen space for neighbour lookups within one cell size. */
class Grid<T extends { x: number; y: number }> {
  private cells = new Map<string, Set<T>>()
  constructor(private readonly size: number) {}
  private keyOf(x: number, y: number) {
    return `${String(Math.floor(x / this.size))}:${String(Math.floor(y / this.size))}`
  }
  add(item: T) {
    const key = this.keyOf(item.x, item.y)
    const cell = this.cells.get(key) ?? new Set<T>()
    cell.add(item)
    this.cells.set(key, cell)
  }
  remove(item: T) {
    this.cells.get(this.keyOf(item.x, item.y))?.delete(item)
  }
  /** Items in the 3 × 3 cells around a point: everything within one cell size of it. */
  *near(x: number, y: number): Generator<T> {
    const cx = Math.floor(x / this.size)
    const cy = Math.floor(y / this.size)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.cells.get(`${String(cx + dx)}:${String(cy + dy)}`)
        if (cell) yield* cell
      }
    }
  }
}

/** Whether any two points are closer than `distance` (grid lookup, not all pairs). */
export function anyCloserThan(
  points: readonly { x: number; y: number }[],
  distance: number,
): boolean {
  const grid = new Grid<{ x: number; y: number }>(distance)
  for (const point of points) {
    for (const other of grid.near(point.x, point.y)) {
      if (Math.hypot(point.x - other.x, point.y - other.y) < distance) return true
    }
    grid.add(point)
  }
  return false
}

/**
 * Agglomerative screen-space clustering: repeatedly merges the two closest groups (by centroid)
 * while they are closer than `threshold` pixels. Splits therefore follow the natural gaps in the
 * data as the camera zooms, and when it finishes every pair of groups is at least `threshold`
 * apart, so badges up to that size never overlap.
 *
 * Deterministic for the same input; `previous` membership (id → cluster key) adds hysteresis so
 * moving markers don't flicker in and out of a cluster at the boundary.
 *
 * Cost: a screen grid limits candidate pairs to neighbours and a heap yields the closest pair,
 * so after a merge only the merged group's pairs are recomputed — about O(n log n) for typical
 * spreads instead of rescanning all pairs per merge.
 */
export function clusterScreenPoints(
  points: readonly ScreenPoint[],
  threshold: number,
  previous: ReadonlyMap<string, string> = new Map(),
): ScreenCluster[] {
  const groups: Group[] = []
  const byGroupKey = new Map<string, Group>()
  const previousOf = (id: string) => {
    const key = previous.get(id)
    return key === undefined ? [] : [key]
  }
  for (const { id, x, y, group } of [...points].sort((a, b) => a.id.localeCompare(b.id))) {
    const existing = group === undefined ? undefined : byGroupKey.get(group)
    if (existing) {
      const count = existing.memberIds.length
      existing.x = (existing.x * count + x) / (count + 1)
      existing.y = (existing.y * count + y) / (count + 1)
      existing.memberIds.push(id)
      previousOf(id).forEach((key) => existing.previousKeys.add(key))
      continue
    }
    const created: Group = {
      key: id,
      x,
      y,
      memberIds: [id],
      previousKeys: new Set(previousOf(id)),
      order: groups.length,
      version: 0,
      alive: true,
    }
    groups.push(created)
    if (group !== undefined) byGroupKey.set(group, created)
  }

  const wereTogether = (a: Group, b: Group) => {
    const [small, large] =
      a.previousKeys.size <= b.previousKeys.size
        ? [a.previousKeys, b.previousKeys]
        : [b.previousKeys, a.previousKeys]
    for (const key of small) if (large.has(key)) return true
    return false
  }

  const reach = threshold * STICKINESS
  const grid = new Grid<Group>(reach)
  const heap = new CandidateHeap()
  const offer = (g: Group) => {
    for (const other of grid.near(g.x, g.y)) {
      if (other === g || !other.alive) continue
      const distance = Math.hypot(g.x - other.x, g.y - other.y)
      const limit = wereTogether(g, other) ? reach : threshold
      if (distance >= limit) continue
      const [a, b] = g.order < other.order ? [g, other] : [other, g]
      heap.push({ distance, a, b, aVersion: a.version, bVersion: b.version })
    }
  }
  for (const g of groups) {
    offer(g)
    grid.add(g)
  }

  for (let next = heap.pop(); next; next = heap.pop()) {
    const { a, b } = next
    if (!a.alive || !b.alive || a.version !== next.aVersion || b.version !== next.bVersion) {
      continue
    }
    grid.remove(a)
    grid.remove(b)
    b.alive = false
    const total = a.memberIds.length + b.memberIds.length
    a.x = (a.x * a.memberIds.length + b.x * b.memberIds.length) / total
    a.y = (a.y * a.memberIds.length + b.y * b.memberIds.length) / total
    a.memberIds = [...a.memberIds, ...b.memberIds].sort((p, q) => p.localeCompare(q))
    a.key = a.memberIds[0] ?? a.key
    b.previousKeys.forEach((key) => a.previousKeys.add(key))
    a.version += 1
    offer(a)
    grid.add(a)
  }

  return groups.filter((g) => g.alive).map(({ key, memberIds }) => ({ key, memberIds }))
}

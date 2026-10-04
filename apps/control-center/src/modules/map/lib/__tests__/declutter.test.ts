import { describe, expect, it } from 'vitest'
import { anyCloserThan, clusterScreenPoints, type ScreenPoint } from '../declutter'

const point = (id: string, x: number, y = 0): ScreenPoint => ({ id, x, y })
const sizes = (clusters: { memberIds: string[] }[]) =>
  clusters.map((c) => c.memberIds.length).sort((a, b) => b - a)

/** 6×4 parking grid with `spacing` px between neighbours. */
const grid = (spacing: number, originX = 0) =>
  Array.from({ length: 24 }, (_, i) =>
    point(
      `uav-${String(i + 1).padStart(2, '0')}`,
      originX + (i % 6) * spacing,
      Math.floor(i / 6) * spacing,
    ),
  )

describe('clusterScreenPoints', () => {
  it('keeps well-separated markers individual', () => {
    expect(
      sizes(clusterScreenPoints([point('a', 0), point('b', 100), point('c', 200)], 40)),
    ).toEqual([1, 1, 1])
  })

  it('collapses a distant fleet into a single badge', () => {
    expect(sizes(clusterScreenPoints(grid(3), 40))).toEqual([24])
  })

  it('splits along the natural gap, not by id order', () => {
    // 18 parked UAVs in a tight block and 6 flying in a line far away.
    const parked = grid(4).slice(6)
    const flying = Array.from({ length: 6 }, (_, i) => point(`uav-0${i + 1}`, 300 + i * 6, 0))
    const clusters = clusterScreenPoints([...parked, ...flying], 40)

    expect(sizes(clusters)).toEqual([18, 6])
    expect(clusters.find((c) => c.memberIds.length === 6)?.memberIds).toEqual(
      flying.map((p) => p.id),
    )
  })

  it('separates a parking grid into individuals once spacing exceeds the threshold', () => {
    expect(sizes(clusterScreenPoints(grid(45), 40))).toEqual(Array.from({ length: 24 }, () => 1))
  })

  it('never leaves two groups closer than the threshold', () => {
    for (const spacing of [5, 12, 20, 28, 36]) {
      const clusters = clusterScreenPoints(grid(spacing), 40)
      const points = grid(spacing)
      const centroid = (ids: string[]) => {
        const members = points.filter((p) => ids.includes(p.id))
        return {
          x: members.reduce((s, p) => s + p.x, 0) / members.length,
          y: members.reduce((s, p) => s + p.y, 0) / members.length,
        }
      }
      const centers = clusters.map((c) => centroid(c.memberIds))
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          const a = centers[i]
          const b = centers[j]
          if (a && b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(40)
        }
      }
    }
  })

  it('is deterministic regardless of input order', () => {
    const points = grid(20)
    expect(clusterScreenPoints(points, 40)).toEqual(clusterScreenPoints([...points].reverse(), 40))
  })

  it('keeps previous members together slightly beyond the threshold', () => {
    const previous = new Map([
      ['a', 'a'],
      ['b', 'a'],
    ])
    expect(clusterScreenPoints([point('a', 0), point('b', 45)], 40)).toHaveLength(2)
    expect(clusterScreenPoints([point('a', 0), point('b', 45)], 40, previous)).toHaveLength(1)
    expect(clusterScreenPoints([point('a', 0), point('b', 55)], 40, previous)).toHaveLength(2)
  })

  it('keeps a grouped formation together instead of splitting it into blocks', () => {
    const formation = grid(20)
      .slice(6)
      .map((p) => ({ ...p, group: 'formation' }))
    expect(sizes(clusterScreenPoints(grid(20).slice(6), 40)).length).toBeGreaterThan(1)
    expect(sizes(clusterScreenPoints(formation, 40))).toEqual([18])
  })

  it('matches a full pairwise scan exactly, including hysteresis (random layouts)', () => {
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let run = 0; run < 40; run++) {
      const points = Array.from({ length: 60 }, (_, i) => ({
        id: `u${String(i).padStart(3, '0')}`,
        x: random() * 600,
        y: random() * 400,
      }))
      const previous = new Map(points.map((p) => [p.id, `c${String(Math.floor(random() * 8))}`]))
      expect(clusterScreenPoints(points, 44, previous)).toEqual(bruteForce(points, 44, previous))
    }
  })

  it('stays fast for a large fleet', () => {
    const points = Array.from({ length: 2_000 }, (_, i) => ({
      id: `u${String(i).padStart(4, '0')}`,
      x: (i % 50) * 30 + (i % 7),
      y: Math.floor(i / 50) * 30,
    }))
    const started = performance.now()
    clusterScreenPoints(points, 44)
    expect(performance.now() - started).toBeLessThan(500)
  })
})

describe('anyCloserThan', () => {
  it('finds a close pair without comparing all pairs', () => {
    expect(
      anyCloserThan(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 103, y: 4 },
        ],
        6,
      ),
    ).toBe(true)
    expect(
      anyCloserThan(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
        ],
        6,
      ),
    ).toBe(false)
  })
})

/** Reference: the straightforward closest-pair rescan the optimized version must match. */
function bruteForce(
  points: readonly { id: string; x: number; y: number }[],
  threshold: number,
  previous: ReadonlyMap<string, string>,
) {
  const groups = [...points]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => ({ key: p.id, x: p.x, y: p.y, memberIds: [p.id] }))
  const together = (a: { memberIds: string[] }, b: { memberIds: string[] }) =>
    a.memberIds.some((m) => b.memberIds.some((n) => previous.get(n) === previous.get(m)))
  for (;;) {
    let best: [number, number, number] | null = null
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i]
        const b = groups[j]
        if (!a || !b) continue
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const limit = together(a, b) ? threshold * 1.25 : threshold
        if (d < limit && (!best || d < best[0])) best = [d, i, j]
      }
    }
    if (!best) break
    const a = groups[best[1]]
    const b = groups[best[2]]
    if (!a || !b) break
    const total = a.memberIds.length + b.memberIds.length
    a.x = (a.x * a.memberIds.length + b.x * b.memberIds.length) / total
    a.y = (a.y * a.memberIds.length + b.y * b.memberIds.length) / total
    a.memberIds = [...a.memberIds, ...b.memberIds].sort((p, q) => p.localeCompare(q))
    a.key = a.memberIds[0] ?? a.key
    groups.splice(best[2], 1)
  }
  return groups.map(({ key, memberIds }) => ({ key, memberIds }))
}

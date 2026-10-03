import { describe, expect, it } from 'vitest'
import { clusterScreenPoints, type ScreenPoint } from '../declutter'

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
})

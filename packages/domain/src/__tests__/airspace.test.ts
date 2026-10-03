import { describe, expect, it } from 'vitest'
import { isPointInPolygon, pathEntersPolygon, polygonsOverlap } from '../airspace'

const p = (latitude: number, longitude: number) => ({ latitude, longitude })
const square = [p(0, 0), p(0, 1), p(1, 1), p(1, 0)]

describe('airspace geometry', () => {
  it('tests point containment', () => {
    expect(isPointInPolygon(p(0.5, 0.5), square)).toBe(true)
    expect(isPointInPolygon(p(1.5, 0.5), square)).toBe(false)
  })

  it('detects paths that enter a polygon, also when no vertex lies inside', () => {
    expect(pathEntersPolygon([p(-1, 0.5), p(0.5, 0.5)], square)).toBe(true)
    expect(pathEntersPolygon([p(0.5, -1), p(0.5, 2)], square)).toBe(true)
    expect(pathEntersPolygon([p(-1, -1), p(-1, 2), p(2, 2)], square)).toBe(false)
  })

  it('detects overlapping polygons, including full containment either way', () => {
    const shifted = square.map((q) => p(q.latitude + 0.5, q.longitude + 0.5))
    const inner = [p(0.4, 0.4), p(0.4, 0.6), p(0.6, 0.6)]
    const apart = square.map((q) => p(q.latitude + 3, q.longitude))
    expect(polygonsOverlap(square, shifted)).toBe(true)
    expect(polygonsOverlap(square, inner)).toBe(true)
    expect(polygonsOverlap(inner, square)).toBe(true)
    expect(polygonsOverlap(square, apart)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { bearingDegrees, destinationPoint, distanceMeters } from '../geo'

const abuDhabi = { latitude: 24.4539, longitude: 54.3773 }

describe('geo', () => {
  it('measures great-circle distance', () => {
    // One degree of meridian arc on a sphere of radius 6371 km.
    const oneDegreeNorth = { ...abuDhabi, latitude: abuDhabi.latitude + 1 }
    expect(distanceMeters(abuDhabi, oneDegreeNorth)).toBeCloseTo(111_194.9, 0)
    expect(distanceMeters(abuDhabi, abuDhabi)).toBe(0)
  })

  it('computes bearings clockwise from north', () => {
    expect(bearingDegrees(abuDhabi, { ...abuDhabi, latitude: 25 })).toBeCloseTo(0)
    expect(bearingDegrees(abuDhabi, { ...abuDhabi, longitude: 55 })).toBeCloseTo(90, 0)
    expect(bearingDegrees(abuDhabi, { ...abuDhabi, latitude: 24 })).toBeCloseTo(180)
    expect(bearingDegrees(abuDhabi, { ...abuDhabi, longitude: 54 })).toBeCloseTo(270, 0)
  })

  it('round-trips destination, distance and bearing', () => {
    const target = destinationPoint(abuDhabi, 37, 1500)
    expect(distanceMeters(abuDhabi, target)).toBeCloseTo(1500, 3)
    expect(bearingDegrees(abuDhabi, target)).toBeCloseTo(37, 3)
  })
})

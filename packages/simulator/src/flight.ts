import {
  bearingDegrees,
  destinationPoint,
  distanceMeters,
  type GeoPoint,
  type GeoPosition,
  type ReturnReason,
  type Uav,
  type Waypoint,
} from '@horizon/domain'
import type { AirspaceRouter } from './airspace-routing'
import type { TelemetryDto } from './protocol'
import type { Random } from './random'

/*
 * The UAV flight model: how one simulated UAV moves, drains its battery and decides to return,
 * tick by tick. Mission bookkeeping, commands and the clock live in the simulator.
 */

export const CRUISE_SPEED_MPS = 14
const CLIMB_RATE_MPS = 4
const BATTERY_DRAIN_PCT_PER_SEC = 0.07
const ARRIVAL_TOLERANCE_METERS = 0.5
/** Returning UAVs climb to their own layer above the scan altitude before heading home. */
const RETURN_LAYER_OFFSET_METERS = 20
/** Battery kept in reserve on top of the estimated cost of flying home. */
const RETURN_RESERVE_PCT = 8
/** Signal penalty applied to a UAV with a degraded link (pushes it below the warning threshold). */
const DEGRADED_SIGNAL_PENALTY = 75

export type FlightPhase = 'parked' | 'mission' | 'returning'

export interface UavRuntime {
  uav: Uav
  home: GeoPosition
  position: GeoPosition
  heading: number
  speed: number
  battery: number
  signal: number
  gpsSatellites: number
  phase: FlightPhase
  returnReason: ReturnReason | null
  telemetryLost: boolean
  /** Last telemetry that reached the backend; what snapshots report while telemetry is lost. */
  lastReported: TelemetryDto | null
  signalDegraded: boolean
  missionId: string | null
  route: Waypoint[]
  waypointIndex: number
  /** Turn points around no-fly zones on the way home, flown at the return layer. */
  returnPath: GeoPoint[]
  /** Route distance from each waypoint to the last one, meters (for the landing estimate). */
  routeRemaining: number[]
  /** Off-route point the UAV drifts to and holds (geofence breach demo); null on route. */
  diversion: GeoPosition | null
  /** Battery level before the low-battery injection; null when not injected. */
  batteryBeforeLow: number | null
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const round = (value: number, digits: number) => Number(value.toFixed(digits))

export interface FlightModelOptions {
  airspace: AirspaceRouter
  /** Ground station: link quality falls off with distance from it. */
  base: GeoPoint
  /** Heading of a UAV parked on its spot. */
  parkedHeading: number
  /** Altitude of the current mission, meters (0 without one); returns fly above it. */
  missionAltitude: () => number
  random: () => Random
}

export function createFlightModel({
  airspace,
  base,
  parkedHeading,
  missionAltitude,
  random,
}: FlightModelOptions) {
  /** Moves toward `target` at cruise speed while climbing/descending; returns true on arrival. */
  function moveToward(state: UavRuntime, target: GeoPosition, dt: number): boolean {
    const remaining = distanceMeters(state.position, target)
    const travel = Math.min(remaining, CRUISE_SPEED_MPS * dt)
    if (travel > ARRIVAL_TOLERANCE_METERS) {
      state.heading = bearingDegrees(state.position, target)
      const next = destinationPoint(state.position, state.heading, travel)
      state.position.latitude = next.latitude
      state.position.longitude = next.longitude
    } else {
      state.position.latitude = target.latitude
      state.position.longitude = target.longitude
    }
    state.speed = travel / dt
    const climb = clamp(
      target.altitude - state.position.altitude,
      -CLIMB_RATE_MPS * dt,
      CLIMB_RATE_MPS * dt,
    )
    state.position.altitude += climb
    return (
      remaining - travel <= ARRIVAL_TOLERANCE_METERS &&
      Math.abs(target.altitude - state.position.altitude) < 0.1
    )
  }

  const returnLayer = () => missionAltitude() + RETURN_LAYER_OFFSET_METERS

  /** Flight time to climb to the return layer, fly home around no-fly zones and land. */
  function returnSeconds(state: UavRuntime, from: GeoPoint, altitude: number): number {
    const layer = returnLayer()
    return (
      Math.max(0, layer - altitude) / CLIMB_RATE_MPS +
      airspace.distance(from, state.home) / CRUISE_SPEED_MPS +
      layer / CLIMB_RATE_MPS
    )
  }

  /** Battery (%) needed to climb to the return layer, fly home and land, plus a reserve. */
  function batteryNeededToReturn(state: UavRuntime): number {
    const seconds = returnSeconds(state, state.position, state.position.altitude)
    return seconds * BATTERY_DRAIN_PCT_PER_SEC + RETURN_RESERVE_PCT
  }

  /** Battery expected on landing: rest of the route (if on mission), then the way home. */
  function landingBattery(state: UavRuntime): number | null {
    if (state.phase === 'parked') return null
    let seconds: number
    const next = state.route[state.waypointIndex]
    const last = state.route.at(-1)
    if (state.phase === 'mission' && next && last) {
      const remaining =
        distanceMeters(state.position, next) + (state.routeRemaining[state.waypointIndex] ?? 0)
      seconds = remaining / CRUISE_SPEED_MPS + returnSeconds(state, last, last.altitude)
    } else {
      seconds = returnSeconds(state, state.position, state.position.altitude)
    }
    return Math.max(0, state.battery - seconds * BATTERY_DRAIN_PCT_PER_SEC)
  }

  function returnHome(state: UavRuntime, reason: ReturnReason) {
    state.phase = 'returning'
    state.returnReason = reason
    // From inside a zone (breach) no clear path exists; the UAV then flies straight out and home.
    state.returnPath = airspace.route(state.position, state.home) ?? []
    state.diversion = null
  }

  /** Puts a UAV on a mission route (waypoints in flight order). */
  function assignRoute(state: UavRuntime, missionId: string, route: Waypoint[]) {
    state.phase = 'mission'
    state.missionId = missionId
    state.route = route
    state.waypointIndex = 0
    // Suffix sums: distance from each waypoint to the end of the route.
    state.routeRemaining = route.map(() => 0)
    for (let i = route.length - 2; i >= 0; i--) {
      const a = route[i]
      const b = route[i + 1]
      state.routeRemaining[i] =
        (state.routeRemaining[i + 1] ?? 0) + (a && b ? distanceMeters(a, b) : 0)
    }
  }

  function advance(state: UavRuntime, dt: number) {
    if (state.phase === 'mission') {
      if (state.battery <= batteryNeededToReturn(state)) {
        returnHome(state, 'low-battery')
      } else if (state.diversion) {
        // Holds inside the zone until the injection is switched off.
        moveToward(state, state.diversion, dt)
      } else {
        const target = state.route[state.waypointIndex]
        if (target && moveToward(state, target, dt)) state.waypointIndex += 1
        if (state.waypointIndex >= state.route.length) returnHome(state, 'completed')
      }
    } else if (state.phase === 'returning') {
      const layer = returnLayer()
      const overHome = distanceMeters(state.position, state.home) <= ARRIVAL_TOLERANCE_METERS
      // Climb vertically to the return layer first, so return paths never cross active scan
      // lines at the scan altitude; then fly home and descend over the parking spot.
      const climbing = !overHome && state.position.altitude < layer - 0.1
      const turn = overHome || climbing ? undefined : state.returnPath[0]
      const target = overHome
        ? state.home
        : climbing
          ? { ...state.position, altitude: layer }
          : { ...(turn ?? state.home), altitude: layer }
      const arrived = moveToward(state, target, dt)
      if (arrived && turn) state.returnPath.shift()
      if (arrived && overHome) {
        state.phase = 'parked'
        state.returnReason = null
        state.speed = 0
        state.heading = parkedHeading
        state.missionId = null
        state.route = []
        state.waypointIndex = 0
        state.diversion = null
      }
    }

    if (state.phase !== 'parked') {
      state.battery = Math.max(0, state.battery - BATTERY_DRAIN_PCT_PER_SEC * dt)
    }
    const distanceKm = distanceMeters(state.position, base) / 1000
    const penalty = state.signalDegraded ? DEGRADED_SIGNAL_PENALTY : 0
    const rng = random()
    state.signal = clamp(98 - distanceKm * 4 - penalty + rng.range(-1.5, 1.5), 0, 100)
    if (rng.next() < 0.01) {
      state.gpsSatellites = clamp(state.gpsSatellites + (rng.next() < 0.5 ? -1 : 1), 9, 19)
    }
  }

  function toTelemetryDto(state: UavRuntime, now: number): TelemetryDto {
    const landing = landingBattery(state)
    return {
      uav_id: state.uav.id,
      ts: now,
      lat: round(state.position.latitude, 7),
      lon: round(state.position.longitude, 7),
      alt_m: round(state.position.altitude, 1),
      speed_mps: round(state.speed, 1),
      heading_deg: round(state.heading, 1),
      battery_pct: round(state.battery, 1),
      signal_pct: Math.round(state.signal),
      gps_sats: state.gpsSatellites,
      mission_id: state.missionId,
      waypoint_index: state.phase === 'parked' ? null : state.waypointIndex,
      flight_phase: state.phase,
      return_reason: state.returnReason,
      landing_battery_pct: landing === null ? null : round(landing, 1),
    }
  }

  return { advance, assignRoute, returnHome, toTelemetryDto }
}

export type FlightModel = ReturnType<typeof createFlightModel>

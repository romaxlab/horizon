import {
  bearingDegrees,
  destinationPoint,
  distanceMeters,
  type GeoPosition,
  type Uav,
  type Waypoint,
} from '@horizon/domain'
import { planAreaScan } from './area-scan'
import { DEMO_BASE, DEMO_FLEET_SIZE, DEMO_MISSION, DEMO_PARKING } from './demo'
import { generateFleet } from './fleet'
import type { FleetSnapshotDto, SimulatorMessage, TelemetryDto, UavDto } from './protocol'
import { createRandom, type Random } from './random'

export type SimulatorMode = 'deterministic' | 'random'

export interface SimulatorOptions {
  /** `deterministic` (default) replays the same run for the same seed. */
  mode?: SimulatorMode
  seed?: number
  fleetSize?: number
  /** Simulated epoch at creation, ms. Defaults to the wall clock. */
  startTime?: number
  /** Physics/telemetry tick, ms. */
  tickMs?: number
}

export type SimulatorCommand = { type: 'startDemoMission' } | { type: 'reset' }

export type CommandResult = { ok: true } | { ok: false; reason: string }

export interface Simulator {
  /** Current simulated time, epoch ms. */
  readonly now: number
  /** Fake REST: current fleet state. */
  getFleetSnapshot(): FleetSnapshotDto
  /** Fake realtime stream. */
  subscribe(listener: (message: SimulatorMessage) => void): () => void
  dispatch(command: SimulatorCommand): CommandResult
  /** Advances simulated time deterministically. */
  step(ms: number): void
  /** Ticks in real time until `stop()`. */
  start(): void
  stop(): void
}

const CRUISE_SPEED_MPS = 14
const CLIMB_RATE_MPS = 4
const BATTERY_DRAIN_PCT_PER_SEC = 0.07
const PARKED_TELEMETRY_EVERY_TICKS = 4
const ARRIVAL_TOLERANCE_METERS = 0.5
/** Parked UAVs all face along the parking rows so the formation reads as an even grid. */
const PARKED_HEADING = (DEMO_PARKING.axisBearing + 180) % 360

type Phase = 'parked' | 'mission' | 'returning'

interface UavRuntime {
  uav: Uav
  home: GeoPosition
  position: GeoPosition
  heading: number
  speed: number
  battery: number
  signal: number
  gpsSatellites: number
  phase: Phase
  missionId: string | null
  route: Waypoint[]
  waypointIndex: number
}

interface MissionRuntime {
  id: string
  altitude: number
  uavIds: string[]
  completed: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number, digits: number) => Number(value.toFixed(digits))

export function createSimulator(options: SimulatorOptions = {}): Simulator {
  const mode = options.mode ?? 'deterministic'
  const seed = options.seed ?? (mode === 'random' ? Math.floor(Math.random() * 2 ** 32) : 1)
  const fleetSize = options.fleetSize ?? DEMO_FLEET_SIZE
  const tickMs = options.tickMs ?? 250

  let now = options.startTime ?? Date.now()
  let tick = 0
  let pendingMs = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let random: Random
  let uavs: UavRuntime[]
  let mission: MissionRuntime | null
  const listeners = new Set<(message: SimulatorMessage) => void>()

  function init() {
    random = createRandom(seed)
    mission = null
    uavs = generateFleet(fleetSize, DEMO_BASE, DEMO_PARKING, random).map(
      ({ uav, home, battery }) => ({
        uav,
        home,
        position: { ...home },
        heading: PARKED_HEADING,
        speed: 0,
        battery,
        signal: 98,
        gpsSatellites: Math.round(random.range(12, 17)),
        phase: 'parked',
        missionId: null,
        route: [],
        waypointIndex: 0,
      }),
    )
  }

  function toTelemetryDto(state: UavRuntime): TelemetryDto {
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
    }
  }

  function toUavDto({ uav }: UavRuntime): UavDto {
    return {
      id: uav.id,
      name: uav.name,
      model: uav.model,
      callsign: uav.callsign,
      has_camera: uav.capabilities.camera,
      has_thermal_camera: uav.capabilities.thermalCamera,
    }
  }

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

  function advanceUav(state: UavRuntime, dt: number) {
    if (state.phase === 'mission') {
      const target = state.route[state.waypointIndex]
      if (target && moveToward(state, target, dt)) state.waypointIndex += 1
      if (state.waypointIndex >= state.route.length) state.phase = 'returning'
    } else if (state.phase === 'returning') {
      const cruise = mission?.altitude ?? state.position.altitude
      const overHome = distanceMeters(state.position, state.home) <= ARRIVAL_TOLERANCE_METERS
      const target = overHome ? state.home : { ...state.home, altitude: cruise }
      if (moveToward(state, target, dt) && overHome) {
        state.phase = 'parked'
        state.speed = 0
        state.heading = PARKED_HEADING
        state.missionId = null
        state.route = []
        state.waypointIndex = 0
      }
    }

    if (state.phase !== 'parked') {
      state.battery = Math.max(0, state.battery - BATTERY_DRAIN_PCT_PER_SEC * dt)
    }
    const distanceKm = distanceMeters(state.position, DEMO_BASE) / 1000
    state.signal = clamp(98 - distanceKm * 4 + random.range(-1.5, 1.5), 0, 100)
    if (random.next() < 0.01) {
      state.gpsSatellites = clamp(state.gpsSatellites + (random.next() < 0.5 ? -1 : 1), 9, 19)
    }
  }

  function updateMissionCompletion() {
    if (!mission || mission.completed) return
    const done = mission.uavIds.every((id) => {
      const state = uavs.find((u) => u.uav.id === id)
      return !state || state.phase !== 'mission'
    })
    if (done) mission.completed = true
  }

  function emit(message: SimulatorMessage) {
    listeners.forEach((listener) => {
      listener(message)
    })
  }

  function runTick() {
    const dt = tickMs / 1000
    now += tickMs
    tick += 1
    uavs.forEach((state, index) => {
      advanceUav(state, dt)
      const flying = state.phase !== 'parked'
      if (flying || (tick + index) % PARKED_TELEMETRY_EVERY_TICKS === 0) {
        emit({ type: 'telemetry', data: toTelemetryDto(state) })
      }
    })
    updateMissionCompletion()
  }

  function startDemoMission(): CommandResult {
    if (mission && !mission.completed) return { ok: false, reason: 'A mission is already active' }
    const available = uavs.filter((u) => u.phase === 'parked' && u.uav.capabilities.camera)
    if (available.length < DEMO_MISSION.uavCount) {
      return { ok: false, reason: 'Not enough standby UAVs' }
    }
    const assigned = available.slice(0, DEMO_MISSION.uavCount)
    const routes = planAreaScan({
      area: DEMO_MISSION.area,
      altitude: DEMO_MISSION.altitude,
      uavs: assigned.map((u) => ({ id: u.uav.id, home: u.home })),
      cruiseSpeedMps: CRUISE_SPEED_MPS,
    })
    routes.forEach((route) => {
      const state = assigned.find((u) => u.uav.id === route.uavId)
      if (!state) return
      state.phase = 'mission'
      state.missionId = DEMO_MISSION.id
      state.route = route.waypoints
      state.waypointIndex = 0
    })
    mission = {
      id: DEMO_MISSION.id,
      altitude: DEMO_MISSION.altitude,
      uavIds: assigned.map((u) => u.uav.id),
      completed: false,
    }
    return { ok: true }
  }

  init()

  return {
    get now() {
      return now
    },
    getFleetSnapshot: () => ({
      server_time: now,
      uavs: uavs.map(toUavDto),
      telemetry: uavs.map(toTelemetryDto),
    }),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispatch(command) {
      switch (command.type) {
        case 'startDemoMission':
          return startDemoMission()
        case 'reset':
          init()
          return { ok: true }
      }
    },
    step(ms) {
      pendingMs += ms
      while (pendingMs >= tickMs) {
        pendingMs -= tickMs
        runTick()
      }
    },
    start() {
      timer ??= setInterval(() => {
        runTick()
      }, tickMs)
    },
    stop() {
      if (timer !== null) clearInterval(timer)
      timer = null
    },
  }
}

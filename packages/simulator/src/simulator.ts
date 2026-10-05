import { distanceMeters, type Geofence, type GeoPoint, type GeoPosition } from '@horizon/domain'
import { createAirspaceRouter } from './airspace-routing'
import {
  DEMO_BASE,
  STRESS_BASE,
  STRESS_MISSION,
  DEMO_FLEET_SIZE,
  DEMO_GEOFENCES,
  DEMO_MISSION,
  DEMO_PARKING,
  STRESS_FLEET_SIZE,
  STRESS_PARKING,
  type DemoPreset,
} from './demo'
import { clamp, createFlightModel, type UavRuntime } from './flight'
import { generateFleet, type ParkingLayout } from './fleet'
import { planMission as buildMissionPlan, type PlanResult } from './mission-plan'
import type {
  FleetSnapshotDto,
  GeofenceDto,
  MissionDto,
  MissionPlanRequestDto,
  SimulatorMessage,
  UavDto,
} from './protocol'
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
  /** No-fly zones that plans and returns detour around. Defaults to the demo zones. */
  geofences?: readonly Geofence[]
}

export type SimulatorCommand =
  | { type: 'startDemoMission' }
  | { type: 'launchMission'; missionId: string }
  | { type: 'abortMission'; missionId: string }
  /** Demo/test control: sets a UAV's battery level. */
  | { type: 'setBattery'; uavId: string; batteryPct: number }
  /** Demo/test control: the UAV keeps flying but its telemetry stops reaching the backend. */
  | { type: 'setTelemetryLoss'; uavId: string; lost: boolean }
  /** Demo/test control: degrades a UAV's radio link quality. */
  | { type: 'setSignalDegraded'; uavId: string; degraded: boolean }
  /** Demo/test control: backend ↔ client network outage (snapshot and stream unreachable). */
  | { type: 'setNetwork'; up: boolean }
  /** Demo/test control: drops a UAV's battery to a low level; off restores the previous level. */
  | { type: 'setLowBattery'; uavId: string; low: boolean }
  /**
   * Demo control: a mission UAV drifts off its route into the nearest no-fly zone and holds
   * there; off resumes its route.
   */
  | { type: 'setGeofenceBreach'; uavId: string; active: boolean }
  /** Demo control: finishes the active mission's scan now; UAVs return and land. */
  | { type: 'completeMission' }
  /** Demo control: simulation speed (1 = real time). */
  | { type: 'setTimeScale'; scale: number }
  /** Demo control: clears all injected failures and restores the network. */
  | { type: 'restoreAll' }
  /** Demo control: resets to a preset (NORMAL / INCIDENT / STRESS). */
  | { type: 'applyPreset'; preset: DemoPreset }
  | { type: 'reset' }

export type { PlanResult }

export type CommandResult = { ok: true } | { ok: false; reason: string }

export interface Simulator {
  /** Current simulated time, epoch ms. */
  readonly now: number
  /** Fake REST: current fleet state. */
  getFleetSnapshot(): FleetSnapshotDto
  /** Fake REST: the current (active or most recent) mission. */
  getActiveMission(): MissionDto | null
  /** Fake REST: no-fly zones. */
  getGeofences(): GeofenceDto[]
  /** Demo introspection: failures injected on a UAV; null for an unknown UAV. */
  getInjections(uavId: string): UavInjections | null
  /** Fake REST: plans an Area Scan with standby UAVs; the plan is kept until launched. */
  planMission(request: MissionPlanRequestDto): PlanResult
  /** Fake realtime stream. */
  subscribe(listener: (message: SimulatorMessage) => void): () => void
  /** Whether the backend is reachable from the client (fake network). */
  readonly networkUp: boolean
  readonly timeScale: number
  readonly fleetSize: number
  /** Nothing to reset: no mission or plan, no injected failures, backend reachable. */
  readonly pristine: boolean
  subscribeNetwork(listener: (up: boolean) => void): () => void
  dispatch(command: SimulatorCommand): CommandResult
  /** Advances simulated time deterministically. */
  step(ms: number): void
  /** Ticks in real time until `stop()`. */
  start(): void
  stop(): void
}

const PARKED_TELEMETRY_EVERY_TICKS = 4
/** Heartbeat period (simulated time); clients treat ~3 missed beats as a dead link. */
const HEARTBEAT_EVERY_MS = 5_000
/** Parked UAVs all face along the parking rows so the formation reads as an even grid. */
const parkedHeadingFor = (layout: ParkingLayout) => (layout.axisBearing + 180) % 360

/** Demo failures currently injected on one UAV. */
export interface UavInjections {
  lowBattery: boolean
  signalDegraded: boolean
  telemetryLost: boolean
  geofenceBreach: boolean
}

/** Battery level set by the low-battery injection: below the warning level, triggers return. */
const INJECTED_LOW_BATTERY_PCT = 18

export function createSimulator(options: SimulatorOptions = {}): Simulator {
  const mode = options.mode ?? 'deterministic'
  const seed = options.seed ?? (mode === 'random' ? Math.floor(Math.random() * 2 ** 32) : 1)
  let fleetSize = options.fleetSize ?? DEMO_FLEET_SIZE
  let parking: ParkingLayout = DEMO_PARKING
  let fleetBase: GeoPosition = DEMO_BASE
  let timeScale = 1
  /** Deterministic scripted commands, by simulated time (INCIDENT preset). */
  let scheduled: { at: number; command: SimulatorCommand }[] = []
  const tickMs = options.tickMs ?? 250
  const geofences = options.geofences ?? DEMO_GEOFENCES
  const airspace = createAirspaceRouter(geofences)

  let now = options.startTime ?? Date.now()
  let tick = 0
  let pendingMs = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let random: Random
  let uavs: UavRuntime[]
  /** The current mission (active or most recent); only one mission is active at a time. */
  let mission: MissionDto | null
  const plannedMissions = new Map<string, MissionDto>()
  let missionSeq = 0
  const listeners = new Set<(message: SimulatorMessage) => void>()
  const networkListeners = new Set<(up: boolean) => void>()
  let networkUp = true

  function init() {
    random = createRandom(seed)
    mission = null
    plannedMissions.clear()
    missionSeq = 0
    scheduled = []
    uavs = generateFleet(fleetSize, fleetBase, parking, random).map(({ uav, home, battery }) => ({
      uav,
      home,
      position: { ...home },
      heading: parkedHeadingFor(parking),
      speed: 0,
      battery,
      signal: 98,
      gpsSatellites: Math.round(random.range(12, 17)),
      phase: 'parked',
      returnReason: null,
      telemetryLost: false,
      lastReported: null,
      signalDegraded: false,
      missionId: null,
      route: [],
      waypointIndex: 0,
      returnPath: [],
      routeRemaining: [],
      diversion: null,
      batteryBeforeLow: null,
    }))
  }

  const flight = createFlightModel({
    airspace,
    base: DEMO_BASE,
    parkedHeading: () => parkedHeadingFor(parking),
    missionAltitude: () => mission?.altitude_m ?? 0,
    random: () => random,
  })
  const toTelemetryDto = (state: UavRuntime) => flight.toTelemetryDto(state, now)

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

  function updateMissionCompletion() {
    if (!mission || mission.status !== 'active') return
    // Complete once every assigned UAV is back on its parking spot, not when scanning ends.
    const done = mission.assigned_uav_ids.every((id) => {
      const state = uavs.find((u) => u.uav.id === id)
      return !state || state.phase === 'parked'
    })
    if (!done) return
    mission = { ...mission, status: 'completed', completed_at: now }
    emit({ type: 'mission', data: mission })
  }

  function emit(message: SimulatorMessage) {
    // During a network outage nothing reaches the client.
    if (!networkUp) return
    listeners.forEach((listener) => {
      listener(message)
    })
  }

  function runTick() {
    const dt = tickMs / 1000
    now += tickMs
    tick += 1
    uavs.forEach((state, index) => {
      flight.advance(state, dt)
      const flying = state.phase !== 'parked'
      if (state.telemetryLost) return
      if (flying || (tick + index) % PARKED_TELEMETRY_EVERY_TICKS === 0) {
        state.lastReported = toTelemetryDto(state)
        emit({ type: 'telemetry', data: state.lastReported })
      }
    })
    updateMissionCompletion()
    if (tick % Math.max(1, Math.round(HEARTBEAT_EVERY_MS / tickMs)) === 0) {
      emit({ type: 'heartbeat', data: { server_time: now } })
    }
    while (scheduled[0] && scheduled[0].at <= now) {
      const next = scheduled.shift()
      if (next) dispatch(next.command)
    }
  }

  const missionActive = () => mission?.status === 'active'

  function planMission(request: MissionPlanRequestDto, id?: string): PlanResult {
    const result = buildMissionPlan({
      request,
      id: id ?? `mission-${String(missionSeq + 1).padStart(3, '0')}`,
      available: uavs
        .filter((u) => u.phase === 'parked' && u.uav.capabilities.camera)
        .map((u) => ({ id: u.uav.id, home: u.home, battery: u.battery })),
      geofences,
      airspace,
      base: DEMO_BASE,
      now,
    })
    if (!result.ok) return result
    missionSeq += 1
    plannedMissions.set(result.mission.id, result.mission)
    return { ok: true, mission: structuredClone(result.mission) }
  }

  function launchMission(missionId: string): CommandResult {
    if (missionActive()) return { ok: false, reason: 'A mission is already active' }
    const planned = plannedMissions.get(missionId)
    if (!planned) return { ok: false, reason: 'Unknown mission plan' }
    const assigned = planned.assigned_uav_ids.map((id) => uavs.find((u) => u.uav.id === id))
    if (assigned.some((u) => !u || u.phase !== 'parked')) {
      return { ok: false, reason: 'Assigned UAVs are no longer available; plan again' }
    }

    for (const route of planned.routes) {
      const state = uavs.find((u) => u.uav.id === route.uav_id)
      if (!state) continue
      flight.assignRoute(
        state,
        planned.id,
        route.waypoints.map((w) => ({
          id: w.id,
          latitude: w.lat,
          longitude: w.lon,
          altitude: w.alt_m,
          order: w.order,
        })),
      )
    }
    plannedMissions.delete(missionId)
    mission = { ...planned, status: 'active', started_at: now }
    emit({ type: 'mission', data: mission })
    return { ok: true }
  }

  function abortMission(missionId: string): CommandResult {
    if (!mission || mission.id !== missionId || !missionActive()) {
      return { ok: false, reason: 'Mission is not active' }
    }
    for (const state of uavs) {
      if (state.missionId === missionId && state.phase === 'mission')
        flight.returnHome(state, 'aborted')
    }
    mission = { ...mission, status: 'aborted', completed_at: now }
    emit({ type: 'mission', data: mission })
    return { ok: true }
  }

  function updateUav(uavId: string, update: (state: UavRuntime) => void): CommandResult {
    const state = uavs.find((u) => u.uav.id === uavId)
    if (!state) return { ok: false, reason: 'Unknown UAV' }
    update(state)
    return { ok: true }
  }

  function setNetwork(up: boolean): CommandResult {
    if (up === networkUp) return { ok: true }
    networkUp = up
    networkListeners.forEach((listener) => {
      listener(up)
    })
    return { ok: true }
  }

  function setBattery(uavId: string, batteryPct: number): CommandResult {
    const state = uavs.find((u) => u.uav.id === uavId)
    if (!state) return { ok: false, reason: 'Unknown UAV' }
    state.battery = clamp(batteryPct, 0, 100)
    return { ok: true }
  }

  function setLowBattery(uavId: string, low: boolean): CommandResult {
    const state = uavs.find((u) => u.uav.id === uavId)
    if (!state) return { ok: false, reason: 'Unknown UAV' }
    if (low && state.batteryBeforeLow === null) {
      state.batteryBeforeLow = state.battery
      state.battery = Math.min(state.battery, INJECTED_LOW_BATTERY_PCT)
    } else if (!low && state.batteryBeforeLow !== null) {
      state.battery = state.batteryBeforeLow
      state.batteryBeforeLow = null
    }
    return { ok: true }
  }

  function setGeofenceBreach(uavId: string, active: boolean): CommandResult {
    const state = uavs.find((u) => u.uav.id === uavId)
    if (!state) return { ok: false, reason: 'Unknown UAV' }
    if (!active) {
      state.diversion = null
      return { ok: true }
    }
    if (state.phase !== 'mission') return { ok: false, reason: 'UAV is not on a mission' }
    const centers = geofences.map((zone) => ({
      latitude: zone.polygon.reduce((sum, p) => sum + p.latitude, 0) / zone.polygon.length,
      longitude: zone.polygon.reduce((sum, p) => sum + p.longitude, 0) / zone.polygon.length,
    }))
    const nearest = centers.reduce<GeoPoint | null>(
      (best, center) =>
        !best || distanceMeters(state.position, center) < distanceMeters(state.position, best)
          ? center
          : best,
      null,
    )
    if (!nearest) return { ok: false, reason: 'No no-fly zones defined' }
    state.diversion = { ...nearest, altitude: state.position.altitude }
    return { ok: true }
  }

  function completeMission(): CommandResult {
    if (!mission || !missionActive()) return { ok: false, reason: 'No active mission' }
    for (const state of uavs) {
      if (state.missionId === mission.id && state.phase === 'mission') {
        state.waypointIndex = state.route.length
        flight.returnHome(state, 'completed')
      }
    }
    return { ok: true }
  }

  function restoreAll(): CommandResult {
    for (const state of uavs) {
      state.telemetryLost = false
      state.signalDegraded = false
      state.diversion = null
      setLowBattery(state.uav.id, false)
    }
    scheduled = []
    return setNetwork(true)
  }

  /**
   * INCIDENT: a deterministic failure sequence on mission UAVs, relative to now —
   * signal degraded → low battery (returns home) → telemetry loss (stale → offline) →
   * backend outage → reconnect and resync → telemetry restored.
   */
  function scheduleIncidentSequence() {
    const [first, second, third] = mission?.assigned_uav_ids ?? []
    if (!first || !second || !third) return
    const at = (seconds: number) => now + seconds * 1000
    scheduled = [
      { at: at(20), command: { type: 'setSignalDegraded', uavId: first, degraded: true } },
      { at: at(30), command: { type: 'setBattery', uavId: second, batteryPct: 19 } },
      { at: at(40), command: { type: 'setTelemetryLoss', uavId: third, lost: true } },
      { at: at(65), command: { type: 'setNetwork', up: false } },
      { at: at(75), command: { type: 'setNetwork', up: true } },
      { at: at(80), command: { type: 'setTelemetryLoss', uavId: third, lost: false } },
      { at: at(85), command: { type: 'setSignalDegraded', uavId: first, degraded: false } },
    ]
  }

  function applyPreset(preset: DemoPreset): CommandResult {
    const stress = preset === 'stress'
    fleetSize = stress ? STRESS_FLEET_SIZE : DEMO_FLEET_SIZE
    parking = stress ? STRESS_PARKING : DEMO_PARKING
    fleetBase = stress ? STRESS_BASE : DEMO_BASE
    init()
    setNetwork(true)
    const started = stress ? startStressMission() : startDemoMission()
    if (started.ok && preset === 'incident') scheduleIncidentSequence()
    return started
  }

  function startStressMission(): CommandResult {
    const plan = planMission(
      {
        name: STRESS_MISSION.name,
        type: 'patrol',
        area: { polygon: STRESS_MISSION.loop.map((p) => ({ lat: p.latitude, lon: p.longitude })) },
        altitude_m: STRESS_MISSION.altitude,
        uav_count: STRESS_MISSION.uavCount,
        laps: STRESS_MISSION.laps,
      },
      STRESS_MISSION.id,
    )
    return plan.ok ? launchMission(plan.mission.id) : plan
  }

  function startDemoMission(): CommandResult {
    if (missionActive()) return { ok: false, reason: 'A mission is already active' }
    const plan = planMission(
      {
        name: DEMO_MISSION.name,
        type: 'area_scan',
        area: {
          polygon: DEMO_MISSION.area.polygon.map((p) => ({ lat: p.latitude, lon: p.longitude })),
        },
        altitude_m: DEMO_MISSION.altitude,
        uav_count: DEMO_MISSION.uavCount,
      },
      DEMO_MISSION.id,
    )
    return plan.ok ? launchMission(plan.mission.id) : plan
  }

  function dispatch(command: SimulatorCommand): CommandResult {
    switch (command.type) {
      case 'startDemoMission':
        return startDemoMission()
      case 'launchMission':
        return launchMission(command.missionId)
      case 'abortMission':
        return abortMission(command.missionId)
      case 'setBattery':
        return setBattery(command.uavId, command.batteryPct)
      case 'setTelemetryLoss':
        return updateUav(command.uavId, (state) => {
          state.telemetryLost = command.lost
        })
      case 'setSignalDegraded':
        return updateUav(command.uavId, (state) => {
          state.signalDegraded = command.degraded
        })
      case 'setNetwork':
        return setNetwork(command.up)
      case 'setLowBattery':
        return setLowBattery(command.uavId, command.low)
      case 'setGeofenceBreach':
        return setGeofenceBreach(command.uavId, command.active)
      case 'completeMission':
        return completeMission()
      case 'setTimeScale':
        timeScale = clamp(Math.round(command.scale), 1, 16)
        if (timer !== null) startTimer()
        return { ok: true }
      case 'restoreAll':
        return restoreAll()
      case 'applyPreset':
        return applyPreset(command.preset)
      case 'reset':
        init()
        setNetwork(true)
        return { ok: true }
    }
  }

  /** Real-time loop; faster time scales tick more often instead of bursting ticks together. */
  function startTimer() {
    if (timer !== null) clearInterval(timer)
    timer = setInterval(runTick, tickMs / timeScale)
  }

  init()

  return {
    get now() {
      return now
    },
    getFleetSnapshot: () => ({
      server_time: now,
      uavs: uavs.map(toUavDto),
      telemetry: uavs.flatMap((state) => {
        if (!state.telemetryLost) return [toTelemetryDto(state)]
        return state.lastReported ? [state.lastReported] : []
      }),
    }),
    getActiveMission: () => (mission ? structuredClone(mission) : null),
    getInjections(uavId) {
      const state = uavs.find((u) => u.uav.id === uavId)
      return state
        ? {
            lowBattery: state.batteryBeforeLow !== null,
            signalDegraded: state.signalDegraded,
            telemetryLost: state.telemetryLost,
            geofenceBreach: state.diversion !== null,
          }
        : null
    },
    getGeofences: () =>
      geofences.map((zone) => ({
        id: zone.id,
        name: zone.name,
        polygon: zone.polygon.map((p) => ({ lat: p.latitude, lon: p.longitude })),
      })),
    planMission: (request) => planMission(request),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get networkUp() {
      return networkUp
    },
    get timeScale() {
      return timeScale
    },
    get fleetSize() {
      return fleetSize
    },
    get pristine() {
      return (
        mission === null &&
        plannedMissions.size === 0 &&
        scheduled.length === 0 &&
        networkUp &&
        uavs.every(
          (u) =>
            !u.telemetryLost &&
            !u.signalDegraded &&
            u.batteryBeforeLow === null &&
            u.diversion === null,
        )
      )
    },
    subscribeNetwork(listener) {
      networkListeners.add(listener)
      return () => networkListeners.delete(listener)
    },
    dispatch,
    step(ms) {
      pendingMs += ms
      while (pendingMs >= tickMs) {
        pendingMs -= tickMs
        runTick()
      }
    },
    start() {
      if (timer === null) startTimer()
    },
    stop() {
      if (timer !== null) clearInterval(timer)
      timer = null
    },
  }
}

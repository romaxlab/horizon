import {
  bearingDegrees,
  destinationPoint,
  distanceMeters,
  polygonsOverlap,
  type GeoPoint,
  type GeoPosition,
  type ReturnReason,
  type Uav,
  type Waypoint,
} from '@horizon/domain'
import { createAirspaceRouter } from './airspace-routing'
import { planAreaScan } from './area-scan'
import {
  DEMO_BASE,
  DEMO_FLEET_SIZE,
  DEMO_GEOFENCES,
  DEMO_MISSION,
  DEMO_PARKING,
  STRESS_FLEET_SIZE,
  STRESS_PARKING,
  type DemoPreset,
} from './demo'
import { generateFleet, type ParkingLayout } from './fleet'
import type {
  FleetSnapshotDto,
  GeofenceDto,
  GeoPointDto,
  MissionDto,
  MissionPlanRequestDto,
  SimulatorMessage,
  TelemetryDto,
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
  /** Demo control: a mission UAV drifts off its route into the nearest no-fly zone, then resumes. */
  | { type: 'breachGeofence'; uavId: string }
  /** Demo control: finishes the active mission's scan now; UAVs return and land. */
  | { type: 'completeMission' }
  /** Demo control: simulation speed (1 = real time). */
  | { type: 'setTimeScale'; scale: number }
  /** Demo control: clears all injected failures and restores the network. */
  | { type: 'restoreAll' }
  /** Demo control: resets to a preset (NORMAL / INCIDENT / STRESS). */
  | { type: 'applyPreset'; preset: DemoPreset }
  | { type: 'reset' }

export type PlanResult =
  | { ok: true; mission: MissionDto }
  /** `geofenceId`: the no-fly zone the plan conflicts with, if that is the reason. */
  | { ok: false; reason: string; geofenceId?: string }

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
  /** Fake REST: plans an Area Scan with standby UAVs; the plan is kept until launched. */
  planMission(request: MissionPlanRequestDto): PlanResult
  /** Fake realtime stream. */
  subscribe(listener: (message: SimulatorMessage) => void): () => void
  /** Whether the backend is reachable from the client (fake network). */
  readonly networkUp: boolean
  readonly timeScale: number
  readonly fleetSize: number
  subscribeNetwork(listener: (up: boolean) => void): () => void
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
/** Returning UAVs climb to their own layer above the scan altitude before heading home. */
const RETURN_LAYER_OFFSET_METERS = 20
/** Battery kept in reserve on top of the estimated cost of flying home. */
const RETURN_RESERVE_PCT = 8
/** Signal penalty applied to a UAV with a degraded link (pushes it below the warning threshold). */
const DEGRADED_SIGNAL_PENALTY = 75
/** Parked UAVs all face along the parking rows so the formation reads as an even grid. */
const PARKED_HEADING = (DEMO_PARKING.axisBearing + 180) % 360
/** Plans and returns detour around the fixed no-fly zones. */
const airspace = createAirspaceRouter(DEMO_GEOFENCES)

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
  /** Off-route point the UAV is drifting to (geofence breach demo); null on route. */
  diversion: GeoPosition | null
}

const toGeoPoint = ({ lat, lon }: GeoPointDto) => ({ latitude: lat, longitude: lon })

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number, digits: number) => Number(value.toFixed(digits))

export function createSimulator(options: SimulatorOptions = {}): Simulator {
  const mode = options.mode ?? 'deterministic'
  const seed = options.seed ?? (mode === 'random' ? Math.floor(Math.random() * 2 ** 32) : 1)
  let fleetSize = options.fleetSize ?? DEMO_FLEET_SIZE
  let parking: ParkingLayout = DEMO_PARKING
  let timeScale = 1
  /** Deterministic scripted commands, by simulated time (INCIDENT preset). */
  let scheduled: { at: number; command: SimulatorCommand }[] = []
  const tickMs = options.tickMs ?? 250

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
    uavs = generateFleet(fleetSize, DEMO_BASE, parking, random).map(({ uav, home, battery }) => ({
      uav,
      home,
      position: { ...home },
      heading: PARKED_HEADING,
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
      diversion: null,
    }))
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
      flight_phase: state.phase,
      return_reason: state.returnReason,
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

  const returnLayer = () => (mission?.altitude_m ?? 0) + RETURN_LAYER_OFFSET_METERS

  /** Battery (%) needed to climb to the return layer, fly home and land, plus a reserve. */
  function batteryNeededToReturn(state: UavRuntime): number {
    const layer = returnLayer()
    const seconds =
      Math.max(0, layer - state.position.altitude) / CLIMB_RATE_MPS +
      airspace.distance(state.position, state.home) / CRUISE_SPEED_MPS +
      layer / CLIMB_RATE_MPS
    return seconds * BATTERY_DRAIN_PCT_PER_SEC + RETURN_RESERVE_PCT
  }

  function returnHome(state: UavRuntime, reason: ReturnReason) {
    state.phase = 'returning'
    state.returnReason = reason
    // From inside a zone (breach) no clear path exists; the UAV then flies straight out and home.
    state.returnPath = airspace.route(state.position, state.home) ?? []
  }

  function advanceUav(state: UavRuntime, dt: number) {
    if (state.phase === 'mission') {
      if (state.battery <= batteryNeededToReturn(state)) {
        returnHome(state, 'low-battery')
      } else if (state.diversion) {
        if (moveToward(state, state.diversion, dt)) state.diversion = null
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
        state.heading = PARKED_HEADING
        state.missionId = null
        state.route = []
        state.waypointIndex = 0
        state.diversion = null
      }
    }

    if (state.phase !== 'parked') {
      state.battery = Math.max(0, state.battery - BATTERY_DRAIN_PCT_PER_SEC * dt)
    }
    const distanceKm = distanceMeters(state.position, DEMO_BASE) / 1000
    const penalty = state.signalDegraded ? DEGRADED_SIGNAL_PENALTY : 0
    state.signal = clamp(98 - distanceKm * 4 - penalty + random.range(-1.5, 1.5), 0, 100)
    if (random.next() < 0.01) {
      state.gpsSatellites = clamp(state.gpsSatellites + (random.next() < 0.5 ? -1 : 1), 9, 19)
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
      advanceUav(state, dt)
      const flying = state.phase !== 'parked'
      if (state.telemetryLost) return
      if (flying || (tick + index) % PARKED_TELEMETRY_EVERY_TICKS === 0) {
        state.lastReported = toTelemetryDto(state)
        emit({ type: 'telemetry', data: state.lastReported })
      }
    })
    updateMissionCompletion()
    while (scheduled[0] && scheduled[0].at <= now) {
      const next = scheduled.shift()
      if (next) dispatch(next.command)
    }
  }

  const missionActive = () => mission?.status === 'active'

  function planMission(request: MissionPlanRequestDto, id?: string): PlanResult {
    if (request.uav_count < 1) return { ok: false, reason: 'At least one UAV is required' }
    const available = uavs.filter((u) => u.phase === 'parked' && u.uav.capabilities.camera)
    if (available.length < request.uav_count) {
      return { ok: false, reason: `Only ${available.length} standby UAVs are available` }
    }
    // Deterministic assignment: the healthiest standby UAVs first, ties by id.
    const assigned = [...available]
      .sort((a, b) => b.battery - a.battery || a.uav.id.localeCompare(b.uav.id))
      .slice(0, request.uav_count)
    const area = request.area.polygon.map(toGeoPoint)
    let routes
    try {
      routes = planAreaScan({
        area: { polygon: area },
        altitude: request.altitude_m,
        uavs: assigned.map((u) => ({ id: u.uav.id, home: u.home })),
        cruiseSpeedMps: CRUISE_SPEED_MPS,
        airspace,
      })
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'Planning failed' }
    }

    if (routes.every((route) => route.waypoints.length === 0)) {
      const zone = DEMO_GEOFENCES.find((z) => polygonsOverlap(area, z.polygon))
      return {
        ok: false,
        reason: zone
          ? `Mission area lies inside no-fly zone "${zone.name}"`
          : 'Mission area has nothing to scan',
        geofenceId: zone?.id,
      }
    }

    missionSeq += 1
    const planned: MissionDto = {
      id: id ?? `mission-${String(missionSeq).padStart(3, '0')}`,
      name: request.name,
      type: 'area_scan',
      status: 'planned',
      area: { polygon: request.area.polygon.map(({ lat, lon }) => ({ lat, lon })) },
      altitude_m: request.altitude_m,
      assigned_uav_ids: assigned.map((u) => u.uav.id),
      routes: routes.map((route) => ({
        uav_id: route.uavId,
        waypoints: route.waypoints.map((w) => ({
          id: w.id,
          lat: w.latitude,
          lon: w.longitude,
          alt_m: w.altitude,
          order: w.order,
        })),
        distance_m: route.distanceMeters,
        eta_s: route.estimatedDurationSec,
      })),
      created_at: now,
      started_at: null,
      completed_at: null,
    }
    plannedMissions.set(planned.id, planned)
    return { ok: true, mission: structuredClone(planned) }
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
      state.phase = 'mission'
      state.missionId = planned.id
      state.route = route.waypoints.map((w) => ({
        id: w.id,
        latitude: w.lat,
        longitude: w.lon,
        altitude: w.alt_m,
        order: w.order,
      }))
      state.waypointIndex = 0
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
      if (state.missionId === missionId && state.phase === 'mission') returnHome(state, 'aborted')
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

  function breachGeofence(uavId: string): CommandResult {
    const state = uavs.find((u) => u.uav.id === uavId)
    if (!state) return { ok: false, reason: 'Unknown UAV' }
    if (state.phase !== 'mission') return { ok: false, reason: 'UAV is not on a mission' }
    const centers = DEMO_GEOFENCES.map((zone) => ({
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
        returnHome(state, 'completed')
      }
    }
    return { ok: true }
  }

  function restoreAll(): CommandResult {
    for (const state of uavs) {
      state.telemetryLost = false
      state.signalDegraded = false
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
    init()
    setNetwork(true)
    const started = startDemoMission()
    if (started.ok && preset === 'incident') scheduleIncidentSequence()
    return started
  }

  function startDemoMission(): CommandResult {
    if (missionActive()) return { ok: false, reason: 'A mission is already active' }
    const plan = planMission(
      {
        name: DEMO_MISSION.name,
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
      case 'breachGeofence':
        return breachGeofence(command.uavId)
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
    getGeofences: () =>
      DEMO_GEOFENCES.map((zone) => ({
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

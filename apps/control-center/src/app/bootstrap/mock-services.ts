import { createMockRealtimeTransport } from '@horizon/realtime'
import { createSimulator, type Simulator } from '@horizon/simulator'
import type { AppServices } from '@/app/providers/services'
import { parseFleetSnapshot, type FleetRepository } from '@/modules/fleet'
import {
  MissionPlanningError,
  parseMission,
  toPlanRequestDto,
  type MissionPlanner,
} from '@/modules/mission-planning'
import type { VideoProvider } from '@/modules/video-monitoring'
import type { AppConfig } from '@/shared/config'
import { HttpError } from '@/shared/http'

/** Simulated network latency for the fake REST endpoints. */
const MOCK_LATENCY_MS = 150

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason as Error)
    })
  })
}

/** Fake REST call: network latency, then fails while the simulated network is down. */
function createRequest(simulator: Simulator) {
  return async (signal?: AbortSignal) => {
    await delay(MOCK_LATENCY_MS, signal)
    if (!simulator.networkUp)
      throw new HttpError('network', 'mock://backend', null, 'Backend unreachable')
  }
}

/**
 * Mock composition: the simulator acts as the backend behind the same contracts a remote
 * backend would implement. Payloads cross the boundary as untyped data and are validated.
 */
export function createMockServices(config: AppConfig): AppServices {
  const simulator = createSimulator({ mode: config.simulatorMode })
  simulator.start()
  const backendCall = createRequest(simulator)
  if (config.demoAutostart) {
    const result = simulator.dispatch({ type: 'startDemoMission' })
    if (!result.ok) console.warn('[bootstrap] demo autostart failed:', result.reason)
  }

  const fleetRepository: FleetRepository = {
    async getSnapshot(signal) {
      await backendCall(signal)
      return parseFleetSnapshot(structuredClone(simulator.getFleetSnapshot()))
    },
  }

  const missionPlanner: MissionPlanner = {
    async plan(planRequest, signal) {
      await backendCall(signal)
      const result = simulator.planMission(toPlanRequestDto(planRequest))
      if (!result.ok) throw new MissionPlanningError(result.reason)
      return parseMission(structuredClone(result.mission))
    },
    async launch(missionId) {
      await backendCall()
      const result = simulator.dispatch({ type: 'launchMission', missionId })
      if (!result.ok) throw new MissionPlanningError(result.reason)
    },
    async abort(missionId) {
      await backendCall()
      const result = simulator.dispatch({ type: 'abortMission', missionId })
      if (!result.ok) throw new MissionPlanningError(result.reason)
    },
    async getActiveMission(signal) {
      await backendCall(signal)
      const mission = simulator.getActiveMission()
      return mission ? parseMission(structuredClone(mission)) : null
    },
  }

  // Simulated nadir camera rendered from keyless Esri World Imagery under each UAV.
  const videoProvider: VideoProvider = {
    async getSource(uavId) {
      await backendCall()
      const hasCamera = simulator
        .getFleetSnapshot()
        .uavs.some((u) => u.id === uavId && u.has_camera)
      return hasCamera
        ? {
            kind: 'synthetic-imagery',
            tileUrlTemplate:
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            maxZoom: 19,
            attribution: 'Esri, Maxar, Earthstar Geographics',
          }
        : null
    },
  }

  return {
    fleetRepository,
    videoProvider,
    missionPlanner,
    realtimeTransport: createMockRealtimeTransport(simulator),
  }
}

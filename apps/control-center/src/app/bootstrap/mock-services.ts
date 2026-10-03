import { createMockRealtimeTransport } from '@horizon/realtime'
import { createSimulator } from '@horizon/simulator'
import type { AppServices } from '@/app/providers/services'
import { parseFleetSnapshot, type FleetRepository } from '@/modules/fleet'
import type { AppConfig } from '@/shared/config'

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

/**
 * Mock composition: the simulator acts as the backend behind the same contracts a remote
 * backend would implement. Payloads cross the boundary as untyped data and are validated.
 */
export function createMockServices(config: AppConfig): AppServices {
  const simulator = createSimulator({ mode: config.simulatorMode })
  simulator.start()
  if (config.demoAutostart) {
    const result = simulator.dispatch({ type: 'startDemoMission' })
    if (!result.ok) console.warn('[bootstrap] demo autostart failed:', result.reason)
  }

  const fleetRepository: FleetRepository = {
    async getSnapshot(signal) {
      await delay(MOCK_LATENCY_MS, signal)
      return parseFleetSnapshot(structuredClone(simulator.getFleetSnapshot()))
    },
  }

  return {
    fleetRepository,
    realtimeTransport: createMockRealtimeTransport(simulator),
  }
}

import type { Mission, MissionArea } from '@horizon/domain'

export interface MissionPlanRequest {
  name: string
  area: MissionArea
  /** Scan altitude above ground, meters. */
  altitude: number
  uavCount: number
}

/** Planning failures the operator can act on (e.g. area too small, not enough UAVs). */
export class MissionPlanningError extends Error {
  override name = 'MissionPlanningError'
}

/** Mission backend boundary. Mock and remote implementations share this contract. */
export interface MissionPlanner {
  /** Generates UAV routes for an Area Scan; the plan is not executed until launched. */
  plan(request: MissionPlanRequest, signal?: AbortSignal): Promise<Mission>
  launch(missionId: string): Promise<void>
  /** Current mission (active or most recent), used on start and after reconnect. */
  getActiveMission(signal?: AbortSignal): Promise<Mission | null>
}

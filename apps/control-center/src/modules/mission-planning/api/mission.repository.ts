import { HttpError, type HttpClient } from '@/shared/http'
import { MissionPlanningError, type MissionPlanner } from '../model/mission.types'
import { toPlanRequestDto } from './mission.mapper'
import { parseMission } from './mission.parsers'

/** Backend rejections the operator can act on (e.g. area too small, UAVs unavailable). */
const PLANNING_REJECTIONS = new Set([409, 422])

function field(body: unknown, key: 'message' | 'geofence_id'): string | null {
  const value = (body as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' ? value : null
}

/** Re-throws backend rejections as planning errors; other failures stay HTTP errors. */
async function planning<T>(request: Promise<T>, fallback: string): Promise<T> {
  try {
    return await request
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.status !== null &&
      PLANNING_REJECTIONS.has(error.status)
    ) {
      throw new MissionPlanningError(
        field(error.body, 'message') ?? fallback,
        field(error.body, 'geofence_id'),
      )
    }
    throw error
  }
}

/**
 * REST mission planner:
 * `POST /missions/plan` · `POST /missions/{id}/launch` · `POST /missions/{id}/abort` ·
 * `GET /missions/current` (empty body when there is no mission).
 */
export function createRemoteMissionPlanner(http: HttpClient): MissionPlanner {
  return {
    async plan(request, signal) {
      const payload = await planning(
        http.post('missions/plan', toPlanRequestDto(request), { signal }),
        'Mission could not be planned',
      )
      return parseMission(payload)
    },
    async launch(missionId) {
      await planning(
        http.request(`missions/${encodeURIComponent(missionId)}/launch`, { method: 'POST' }),
        'Mission could not be launched',
      )
    },
    async abort(missionId) {
      await planning(
        http.request(`missions/${encodeURIComponent(missionId)}/abort`, { method: 'POST' }),
        'Mission could not be stopped',
      )
    },
    async getActiveMission(signal) {
      const payload = await http.get('missions/current', { signal })
      return payload === null ? null : parseMission(payload)
    },
  }
}

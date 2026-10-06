import type { MissionType, UavTelemetry } from '@horizon/domain'
import { useMutation } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import { formatDuration } from '@/shared/lib/format'
import { stableComputed } from '@/shared/lib/stable-computed'
import { computeMissionProgress, type UavMissionStatus } from '../model/mission-progress'
import { useMissionStore } from '../store/mission.store'
import { missionPlannerSlot } from '../model/mission.types'

/** What UAVs on a mission of this type are doing, for the status line. */
const MISSION_ACTIVITY: Record<MissionType, string> = {
  area_scan: 'scanning',
  patrol: 'patrolling',
  point_inspection: 'inspecting',
}

/** One part of the mission status line, e.g. "3 scanning"; warnings stand out. */
export interface MissionPhaseCount {
  text: string
  tone: 'muted' | 'warning'
}

/** One mission UAV's part in the active mission, worded for the details list and inspector. */
export interface MissionUavRow {
  uavId: string
  uavName: string
  name: string
  /** e.g. "En route", "Patrolling · lap 2 of 3", "Returning · low battery". */
  phase: string
  tone: 'secondary' | 'warning'
  /** 0–1 share of this UAV's flight covered; null when not flying the mission. */
  ratio: number | null
  /** e.g. "Lands in 4:12". */
  eta: string | null
  /** Estimated battery on landing; warning below the low-battery threshold. */
  landingBattery: { label: string; tone: 'secondary' | 'warning' } | null
}

function phaseLabel(type: MissionType, status: UavMissionStatus): string {
  const repeat = type === 'point_inspection' ? 'orbit' : 'lap'
  switch (status.phase) {
    case 'pending':
      return 'Waiting for launch'
    case 'en_route':
      return 'En route'
    case 'on_task': {
      const activity = MISSION_ACTIVITY[type]
      const label = activity.charAt(0).toUpperCase() + activity.slice(1)
      return status.lap
        ? `${label} · ${repeat} ${String(status.lap.current)} of ${String(status.lap.total)}`
        : label
    }
    case 'returning':
      return status.returnReason === 'low-battery'
        ? 'Returning · low battery'
        : status.returnReason === 'aborted'
          ? 'Returning · mission stopped'
          : 'Returning home'
    case 'landed':
      return 'Landed'
  }
}

const isLowBatteryReturn = (u: UavMissionStatus) =>
  u.phase === 'returning' && u.returnReason === 'low-battery'

/** The status line re-renders only when its visible content changes, not on every flush. */
const sameSummary = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The current mission as the operator sees it: progress, the status-line summary, per-UAV rows
 * and the Stop command. Fleet data comes in through the inputs (this module does not read the
 * fleet store), so the route-level composition stays plain wiring.
 */
export function useMissionStatus({
  telemetryOf,
  uavNameOf,
  standbyCount,
  lowBatteryPct,
}: {
  telemetryOf: (uavId: string) => UavTelemetry | null
  uavNameOf: (uavId: string) => string | null
  /** UAVs ready for a new mission, for the idle status line. */
  standbyCount: Readonly<Ref<number>>
  lowBatteryPct: number
}) {
  const missions = useMissionStore()
  const missionPlanner = missionPlannerSlot.use()

  const active = computed(() => missions.current?.status === 'active')

  const progress = computed(() => {
    const current = missions.current
    if (!current) return null
    // Only the mission's UAVs matter; don't walk the whole fleet on every flush.
    const telemetry = new Map(
      current.assignedUavIds.flatMap((id) => {
        const sample = telemetryOf(id)
        return sample ? [[id, sample] as const] : []
      }),
    )
    return computeMissionProgress(current, telemetry)
  })

  // Stable: the view only updates when the visible summary changes, not on every flush.
  const summary = stableComputed(() => {
    const current = missions.current
    const p = progress.value
    if (!current || !p || current.status !== 'active') {
      return {
        // The header only names a mission while it is active.
        title: null,
        state: 'Standing by',
        detail: `${String(standbyCount.value)} UAVs ready`,
        phases: null,
        progress: null,
      }
    }
    // Exceptions stand out: a low-battery return is counted apart, in warning tone.
    const count = (match: (u: UavMissionStatus) => boolean) => p.uavs.filter(match).length
    const counts: (MissionPhaseCount & { n: number })[] = [
      { text: 'en route', n: count((u) => u.phase === 'en_route'), tone: 'muted' },
      {
        text: MISSION_ACTIVITY[current.type],
        n: count((u) => u.phase === 'on_task'),
        tone: 'muted',
      },
      {
        text: 'returning',
        n: count((u) => u.phase === 'returning' && !isLowBatteryReturn(u)),
        tone: 'muted',
      },
      { text: 'low battery', n: count(isLowBatteryReturn), tone: 'warning' },
    ]
    const phases: MissionPhaseCount[] = counts
      .filter((c) => c.n > 0)
      .map((c) => ({ text: `${String(c.n)} ${c.text}`, tone: c.tone }))
    if (p.etaSec !== null && p.etaSec > 0) {
      phases.push({ text: `ETA ${formatDuration(p.etaSec)}`, tone: 'muted' })
    }
    return {
      title: current.name,
      // Floor: 100% only once every UAV has landed (the mission then completes).
      state: `${String(Math.floor(p.ratio * 100))}%`,
      detail: phases.map((c) => c.text).join(' · '),
      phases,
      progress: p.ratio,
    }
  }, sameSummary)

  const uavRows = computed<MissionUavRow[]>(() => {
    const current = missions.current
    const p = progress.value
    if (!current || !p || current.status !== 'active') return []
    return p.uavs.map((status) => {
      const flying = status.phase !== 'pending' && status.phase !== 'landed'
      const landing = flying ? (telemetryOf(status.uavId)?.landingBattery ?? null) : null
      return {
        uavId: status.uavId,
        uavName: uavNameOf(status.uavId) ?? status.uavId,
        name: current.name,
        phase: phaseLabel(current.type, status),
        tone: isLowBatteryReturn(status) ? 'warning' : 'secondary',
        ratio: flying ? status.ratio : null,
        eta: flying && status.etaSec !== null ? `Lands in ${formatDuration(status.etaSec)}` : null,
        landingBattery:
          landing === null
            ? null
            : {
                label: `≈ ${String(Math.round(landing))}%`,
                tone: landing < lowBatteryPct ? 'warning' : 'secondary',
              },
      }
    })
  })

  /** UAVs still flying toward or along the task: "Complete mission" has something to end. */
  const tasking = computed(
    () =>
      active.value &&
      (progress.value?.uavs.some((u) => u.phase === 'en_route' || u.phase === 'on_task') ?? false),
  )

  const abort = useMutation({
    mutationFn: (missionId: string) => missionPlanner.abort(missionId),
  })
  function stop() {
    const current = missions.current
    if (current?.status === 'active') abort.mutate(current.id)
  }

  return {
    active,
    summary,
    uavRows,
    tasking,
    stop,
    stopping: computed(() => abort.isPending.value),
    stopError: computed(() => abort.error.value?.message ?? null),
  }
}

export type MissionStatus = ReturnType<typeof useMissionStatus>

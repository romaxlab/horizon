import type { ProgressTone, TextTone } from '@horizon/ui'
import { computed, type Ref } from 'vue'
import { formatAge, formatCardinal } from '@/shared/lib/format'
import { useNow } from '@/shared/lib/useNow'
import { uavStatusPresentation } from './fleet.presentation'
import {
  healthIssues,
  LOW_BATTERY_PCT,
  MIN_GPS_SATELLITES,
  WEAK_SIGNAL_PCT,
  type HealthIssue,
} from './fleet.status'
import { useFleetStore } from './fleet.store'

const issueLabels: Record<HealthIssue, string> = {
  'low-battery': 'Low battery',
  'weak-signal': 'Weak signal',
  'poor-gps': 'Poor GPS fix',
}

const fixed = (value: number, digits = 0) => value.toFixed(digits)

/** View model for the UAV Inspector of the selected UAV. Null when nothing is selected. */
export function useUavInspector(now: Readonly<Ref<number>> = useNow()) {
  const store = useFleetStore()

  const inspector = computed(() => {
    const state = store.selectedUav
    if (!state) return null
    const { uav, telemetry, status, lastUpdatedAt } = state
    const linkDegraded = status === 'stale' || status === 'offline'

    const battery = telemetry?.battery ?? null
    const batteryTone: ProgressTone =
      battery === null
        ? 'neutral'
        : battery < LOW_BATTERY_PCT
          ? 'danger'
          : battery < 35
            ? 'warning'
            : 'success'
    const tone = (bad: boolean): TextTone => (bad ? 'warning' : 'primary')

    return {
      id: uav.id,
      name: uav.name,
      subtitle: `${uav.model} · ${uav.callsign}`,
      status: uavStatusPresentation[status],
      battery:
        battery === null
          ? null
          : { value: battery, label: `${fixed(battery)}%`, tone: batteryTone },
      metrics: telemetry
        ? [
            {
              label: 'Altitude',
              value: fixed(telemetry.position.altitude),
              unit: 'm AGL',
              tone: tone(false),
            },
            { label: 'Speed', value: fixed(telemetry.speed, 1), unit: 'm/s', tone: tone(false) },
            {
              label: 'Heading',
              value: `${fixed(telemetry.heading)}°`,
              unit: formatCardinal(telemetry.heading),
              tone: tone(false),
            },
            {
              label: 'Signal',
              value: fixed(telemetry.signal),
              unit: '%',
              tone: tone(telemetry.signal < WEAK_SIGNAL_PCT),
            },
            {
              label: 'GPS',
              value: String(telemetry.gpsSatellites),
              unit: 'sats',
              tone: tone(telemetry.gpsSatellites < MIN_GPS_SATELLITES),
            },
          ]
        : [],
      lastUpdate: {
        label: lastUpdatedAt === null ? 'Never' : formatAge(now.value - lastUpdatedAt),
        degraded: linkDegraded,
      },
      issues: telemetry && !linkDegraded ? healthIssues(telemetry).map((i) => issueLabels[i]) : [],
      mission: telemetry?.missionId
        ? {
            id: telemetry.missionId,
            waypoint: telemetry.currentWaypoint === null ? null : telemetry.currentWaypoint + 1,
          }
        : null,
    }
  })

  return { inspector }
}

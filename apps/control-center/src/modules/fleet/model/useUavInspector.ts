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
import { HISTORY_WINDOW_MS, type TelemetrySample } from './telemetry-history'

const issueLabels: Record<HealthIssue, string> = {
  'low-battery': 'Low battery',
  'weak-signal': 'Weak signal',
  'poor-gps': 'Poor GPS fix',
}

const fixed = (value: number, digits = 0) => value.toFixed(digits)

interface TrendSeries {
  label: string
  values: number[]
  min?: number
  max?: number
  tone: ProgressTone
}

function trendSeries(
  history: readonly TelemetrySample[],
  batteryTone: ProgressTone,
): TrendSeries[] {
  return [
    { label: 'Altitude', values: history.map((s) => s.altitude), min: 0, tone: 'info' },
    { label: 'Speed', values: history.map((s) => s.speed), min: 0, tone: 'info' },
    {
      label: 'Battery',
      values: history.map((s) => s.battery),
      min: 0,
      max: 100,
      tone: batteryTone,
    },
  ]
}

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
    // Re-read on every live update of this UAV: the store records history before committing.
    const history = store.historyFor(uav.id)

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
      trends:
        history.length < 2
          ? null
          : {
              window: `Last ${String(HISTORY_WINDOW_MS / 60_000)} min`,
              series: trendSeries(history, batteryTone),
            },
      lastUpdate: {
        label: lastUpdatedAt === null ? 'Never' : formatAge(now.value - lastUpdatedAt),
        degraded: linkDegraded,
      },
      issues: telemetry && !linkDegraded ? healthIssues(telemetry).map((i) => issueLabels[i]) : [],
    }
  })

  return { inspector }
}

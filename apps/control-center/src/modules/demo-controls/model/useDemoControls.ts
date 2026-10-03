import type { SegmentOption } from '@horizon/ui'
import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import type { DemoCommand, DemoControl, DemoPreset } from './demo.types'

export interface DemoDiagnosticsSource {
  /** Cumulative realtime counters from the ingestion pipeline. */
  stats(): {
    messages: number
    flushes: number
    applied: number
    coalesced: number
    dropped: number
  }
  fleetSize: Readonly<Ref<number>>
  connection: Readonly<Ref<string>>
}

export interface DemoTarget {
  id: string
  name: string
}

const TIME_SCALES = [1, 2, 4, 8] as const

/**
 * Demo controls and live diagnostics. Commands go to the simulator through `DemoControl`;
 * after a preset/reset the app resyncs through its normal snapshot path (`onResync`).
 */
export function useDemoControls({
  control,
  target,
  diagnostics,
  onResync,
}: {
  control: DemoControl
  /** UAV that targeted failures apply to (selected UAV, else a mission UAV). */
  target: Readonly<Ref<DemoTarget | null>>
  diagnostics: DemoDiagnosticsSource
  onResync: () => void
}) {
  const lastError = ref<string | null>(null)
  /** Scenario applied last; null after a plain reset. */
  const activePreset = ref<DemoPreset | null>(null)
  const timeScale = ref(control.timeScale)

  function run(command: DemoCommand) {
    const result = control.dispatch(command)
    lastError.value = result.ok ? null : (result.reason ?? 'Command failed')
    if (result.resync) onResync()
  }

  function applyPreset(preset: DemoPreset) {
    run({ type: 'preset', preset })
    if (!lastError.value) activePreset.value = preset
  }

  function inject(type: 'lowBattery' | 'degradeSignal' | 'loseTelemetry') {
    const uav = target.value
    if (uav) run({ type, uavId: uav.id })
  }

  const timeScaleOptions: SegmentOption<string>[] = TIME_SCALES.map((scale) => ({
    value: String(scale),
    label: `${scale}×`,
  }))
  const selectedTimeScale = computed(() => String(timeScale.value))
  function setTimeScale(value: string) {
    timeScale.value = Number(value)
    run({ type: 'setTimeScale', scale: timeScale.value })
  }

  // Diagnostics: rates sampled once per second from cumulative counters.
  const rates = ref({
    messagesPerSec: 0,
    flushesPerSec: 0,
    appliedPerSec: 0,
    coalescedPerSec: 0,
    droppedPerSec: 0,
  })
  let last = diagnostics.stats()
  let lastAt = performance.now()
  const timer = setInterval(() => {
    const next = diagnostics.stats()
    const at = performance.now()
    const seconds = (at - lastAt) / 1000
    const rate = (key: keyof typeof next) => Math.round((next[key] - last[key]) / seconds)
    rates.value = {
      messagesPerSec: rate('messages'),
      flushesPerSec: rate('flushes'),
      appliedPerSec: rate('applied'),
      coalescedPerSec: rate('coalesced'),
      droppedPerSec: rate('dropped'),
    }
    last = next
    lastAt = at
  }, 1_000)
  // Render diagnostics: frames per second and the slow-frame time (p95) over the last second.
  const frames = ref({ fps: 0, p95: 0 })
  let frameTimes: number[] = []
  let lastFrame = performance.now()
  let frameWindowStart = lastFrame
  let raf = requestAnimationFrame(function onFrame(time) {
    frameTimes.push(time - lastFrame)
    lastFrame = time
    if (time - frameWindowStart >= 1_000) {
      const sorted = [...frameTimes].sort((a, b) => a - b)
      frames.value = {
        fps: Math.round((frameTimes.length * 1_000) / (time - frameWindowStart)),
        p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
      }
      frameTimes = []
      frameWindowStart = time
    }
    raf = requestAnimationFrame(onFrame)
  })

  onBeforeUnmount(() => {
    clearInterval(timer)
    cancelAnimationFrame(raf)
  })

  const diagnosticsRows = computed(() => [
    { label: 'Render', value: `${frames.value.fps} fps · p95 ${frames.value.p95} ms` },
    { label: 'Telemetry in', value: `${rates.value.messagesPerSec} msg/s` },
    {
      label: 'State flushes',
      value: `${rates.value.flushesPerSec} /s · ${rates.value.appliedPerSec} UAV upd/s`,
    },
    {
      label: 'Coalesced',
      value: `${rates.value.coalescedPerSec} /s · stale ${rates.value.droppedPerSec} /s`,
    },
    { label: 'Fleet size', value: String(diagnostics.fleetSize.value) },
    { label: 'Connection', value: diagnostics.connection.value },
  ])

  return {
    target,
    lastError,
    activePreset,
    timeScaleOptions,
    selectedTimeScale,
    setTimeScale,
    diagnosticsRows,
    applyPreset,
    inject,
    networkOutage: () => {
      run({ type: 'networkOutage' })
    },
    restoreAll: () => {
      run({ type: 'restoreAll' })
    },
    completeMission: () => {
      run({ type: 'completeMission' })
    },
    reset: () => {
      run({ type: 'reset' })
      activePreset.value = null
    },
  }
}

export type DemoControls = ReturnType<typeof useDemoControls>

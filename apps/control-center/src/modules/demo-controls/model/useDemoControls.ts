import type { SegmentOption } from '@horizon/ui'
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type {
  DemoCommand,
  DemoControl,
  DemoInjection,
  DemoInjections,
  DemoPreset,
} from './demo.types'

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
  /** Flying its mission route (a no-fly zone drift needs one). */
  onMission: boolean
}

const NO_INJECTIONS: DemoInjections = {
  lowBattery: false,
  signalDegraded: false,
  telemetryLost: false,
  geofenceBreach: false,
}

const TIME_SCALES = [1, 2, 4, 8] as const

/**
 * Demo controls and live diagnostics. Commands go to the simulator through `DemoControl`;
 * after a preset/reset the app resyncs through its normal snapshot path (`onResync`).
 */
/** Success messages fade after a while; failures stay until the next command. */
const FEEDBACK_MS = 4_000

export interface DemoFeedback {
  tone: 'success' | 'warning'
  text: string
}

export function useDemoControls({
  control,
  target,
  missionScanning,
  diagnostics,
  onResync,
}: {
  control: DemoControl
  /** UAV that targeted failures apply to (selected UAV, else a mission UAV). */
  target: Readonly<Ref<DemoTarget | null>>
  /** A mission is active and some of its UAVs are still scanning. */
  missionScanning: Readonly<Ref<boolean>>
  diagnostics: DemoDiagnosticsSource
  onResync: () => void
}) {
  /** Outcome of the last command, shown in a fixed status line (the panel never resizes). */
  const feedback = ref<DemoFeedback | null>(null)
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined
  /** Scenario applied last; null after a plain reset. */
  const activePreset = ref<DemoPreset | null>(null)
  const timeScale = ref(control.timeScale)
  /** Injected failures on the target and the backend link, read back from the simulator. */
  const injections = ref<DemoInjections>(NO_INJECTIONS)
  const networkUp = ref(control.networkUp)
  const pristine = ref(control.pristine)

  // The simulator can change these on its own (INCIDENT script, a UAV landing), so they are
  // re-read after every command, on target change and once per second.
  function refresh() {
    const uav = target.value
    injections.value = (uav && control.injections(uav.id)) ?? NO_INJECTIONS
    networkUp.value = control.networkUp
    pristine.value = control.pristine
  }
  watch(target, refresh, { immediate: true })

  /** Dispatches a command; `done` is the confirmation shown when it succeeds. */
  function run(command: DemoCommand, done?: string): boolean {
    const result = control.dispatch(command)
    clearTimeout(feedbackTimer)
    if (!result.ok) {
      feedback.value = { tone: 'warning', text: result.reason ?? 'Command failed' }
    } else if (done) {
      feedback.value = { tone: 'success', text: done }
      feedbackTimer = setTimeout(() => {
        feedback.value = null
      }, FEEDBACK_MS)
    } else {
      feedback.value = null
    }
    refresh()
    if (result.resync) onResync()
    return result.ok
  }

  const presetNames: Record<DemoPreset, string> = {
    normal: 'Normal',
    incident: 'Incident',
    stress: 'Stress',
  }
  function applyPreset(preset: DemoPreset) {
    if (run({ type: 'preset', preset }, `${presetNames[preset]} scenario started`)) {
      activePreset.value = preset
    }
  }

  /** Switches a failure on or off for the target UAV; off restores the previous behavior. */
  function setInjection(injection: DemoInjection, active: boolean) {
    const uav = target.value
    if (uav) run({ type: 'setInjection', uavId: uav.id, injection, active })
  }
  const anyInjected = computed(
    () => !networkUp.value || Object.values(injections.value).some(Boolean),
  )

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
    refresh()
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
  // Sampled only while someone is looking (the panel is open); otherwise no frame loop runs.
  const frames = ref({ fps: 0, p95: 0 })
  const diagnosticsVisible = ref(false)
  let frameTimes: number[] = []
  let lastFrame = 0
  let frameWindowStart = 0
  let raf: number | null = null
  function onFrame(time: number) {
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
  }
  function stopFrameSampling() {
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
  }
  watch(diagnosticsVisible, (visible) => {
    stopFrameSampling()
    if (!visible) return
    frameTimes = []
    lastFrame = frameWindowStart = performance.now()
    raf = requestAnimationFrame(onFrame)
  })

  onBeforeUnmount(() => {
    clearTimeout(feedbackTimer)
    clearInterval(timer)
    stopFrameSampling()
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
    feedback,
    activePreset,
    timeScaleOptions,
    selectedTimeScale,
    setTimeScale,
    diagnosticsRows,
    /** The view reports when diagnostics are on screen; frames are sampled only then. */
    setDiagnosticsVisible: (visible: boolean) => {
      diagnosticsVisible.value = visible
    },
    applyPreset,
    injections,
    setInjection,
    networkUp,
    setNetworkOutage: (outage: boolean) => {
      run({ type: 'setNetwork', up: !outage })
    },
    anyInjected,
    restoreAll: () => {
      run({ type: 'restoreAll' }, 'All failures cleared')
    },
    canCompleteMission: missionScanning,
    completeMission: () => {
      run({ type: 'completeMission' }, 'Scan ended · UAVs returning to land')
    },
    canReset: computed(() => !pristine.value),
    reset: () => {
      if (run({ type: 'reset' }, 'Simulation reset · fleet parked')) activePreset.value = null
    },
  }
}

export type DemoControls = ReturnType<typeof useDemoControls>

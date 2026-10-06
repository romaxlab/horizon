export { demoControlSlot } from './model/demo.types'
export type {
  DemoCommand,
  DemoCommandResult,
  DemoControl,
  DemoInjection,
  DemoInjections,
  DemoPreset,
} from './model/demo.types'
export { useDemoControls, type DemoControls, type DemoTarget } from './composables/useDemoControls'
export { default as DemoControlsPanel } from './ui/DemoControlsPanel.vue'

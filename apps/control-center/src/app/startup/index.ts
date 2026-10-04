/*
 * Cinematic startup sequence (VITE_CINEMATIC_INTRO). Self-contained: removing this folder, its
 * use in App.vue and create-horizon-app.ts, and the `data-reveal` marks in the Control Center
 * removes the feature (the map keeps its general arrival capability).
 */
export { stageStartup } from './startup-stage'
export { useStartup } from './useStartup'
export { default as StartupIntro } from './StartupIntro.vue'

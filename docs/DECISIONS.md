# Architecture / Product Decisions

This file records decisions already agreed so agents do not repeatedly reopen them.

## D-001 — Vue 3 + Vite, not Nuxt

The Control Center is an interactive SPA/workstation application. SSR is not useful enough to justify Nuxt-specific complexity for the MVP.

## D-002 — pnpm monorepo

Use a small pnpm workspace because the target role emphasizes shared packages/workspaces and because simulator/realtime/UI/domain are meaningful boundaries.

Do not create packages for trivial utilities.

## D-003 — Modular vertical slices, not strict FSD

Application capabilities live under `modules/*` with small `ui/model/api/index.ts` boundaries.

## D-004 — Route naming consistency

Main route/module/root view/composable use the same concept:

```text
/control-center
modules/control-center
ControlCenterView.vue
useControlCenter.ts
```

## D-005 — Thin Vue UI

Vue components consume dedicated composables and primitives. Business logic, transport logic and DTO mapping do not live in `.vue` components.

## D-006 — TanStack Query + Pinia split

- Query: REST request lifecycle/server cache.
- Pinia: shared realtime/current client state.
- local state: composable/component.

For realtime entities, Query hydrates/reconciles Pinia rather than becoming a competing live source of truth.

## D-007 — Native fetch, no Axios initially

Use a small HttpClient wrapper over native fetch. Add Axios only if a concrete requirement appears.

## D-008 — Direct CesiumJS integration

Use CesiumJS directly behind the app's map module instead of a third-party Vue Cesium wrapper.

Do not extract a workspace map package until real reuse appears.

## D-009 — First-party design system

Use TailwindCSS + semantic CSS-variable tokens + first-party primitives.

No general-purpose component library.

Raw design values live only in token source files.

## D-010 — Both themes from day one

Light and dark are token aliases, not separate component styling paths.

## D-011 — Deterministic simulator

The simulator is a fake backend using the same contracts as future real infrastructure.

Demo controls manipulate simulator state, never Pinia/UI state directly.

## D-012 — SOLID without ceremony

Use small contracts around external systems and clear responsibilities, but avoid interfaces/classes for trivial local logic.

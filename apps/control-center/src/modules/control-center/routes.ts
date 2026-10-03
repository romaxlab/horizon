import type { RouteRecordRaw } from 'vue-router'

export const controlCenterRoutes: RouteRecordRaw[] = [
  {
    path: '/control-center',
    name: 'control-center',
    component: () => import('./ui/ControlCenterView.vue'),
  },
]

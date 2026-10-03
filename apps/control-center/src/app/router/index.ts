import { createRouter, createWebHistory } from 'vue-router'
import { controlCenterRoutes } from '@/modules/control-center'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...controlCenterRoutes,
    { path: '/:pathMatch(.*)*', redirect: { name: 'control-center' } },
  ],
})

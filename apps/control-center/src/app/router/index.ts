import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/control-center',
      name: 'control-center',
      component: () => import('@/app/ControlCenterPlaceholder.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'control-center' } },
  ],
})

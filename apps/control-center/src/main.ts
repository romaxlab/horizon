import '@fontsource-variable/inter'
import '@/app/styles/main.css'
import { initTheme } from '@horizon/ui'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from '@/app/App.vue'
import { router } from '@/app/router'

initTheme()

createApp(App).use(createPinia()).use(router).use(VueQueryPlugin).mount('#app')

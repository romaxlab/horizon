import '@fontsource-variable/inter'
import '@/app/styles/main.css'
import { createHorizonApp } from '@/app/bootstrap/create-horizon-app'
import { appConfig } from '@/shared/config'

createHorizonApp(appConfig).mount('#app')

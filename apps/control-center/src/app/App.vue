<script setup lang="ts">
import { appConfig } from '@/shared/config'
import { StartupIntro, useStartup } from './startup'

const startup = appConfig.cinematicIntro ? useStartup() : null
</script>

<template>
  <!-- Under the intro overlay the app takes no focus or input until it is handed over. -->
  <div class="contents" :inert="startup?.blocking.value ?? false">
    <RouterView />
  </div>
  <StartupIntro v-if="startup" :sequence="startup" />
</template>

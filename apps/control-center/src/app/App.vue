<script setup lang="ts">
import { appConfig } from '@/shared/config'
import { StartupIntro } from './startup'
</script>

<template>
  <RouterView />
  <StartupIntro v-if="appConfig.cinematicIntro" />
</template>

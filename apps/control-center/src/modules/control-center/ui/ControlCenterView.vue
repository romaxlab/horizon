<script setup lang="ts">
import { PanelLeftOpen } from '@lucide/vue'
import { BaseIconButton, BaseSurface } from '@horizon/ui'
import { ref } from 'vue'
import { FleetPanel, UavInspector } from '@/modules/fleet'
import { MapCanvas, MapControls } from '@/modules/map'
import { MissionBuilderPanel } from '@/modules/mission-planning'
import { useControlCenter } from '../model/useControlCenter'
import ControlCenterHeader from './ControlCenterHeader.vue'
import MissionStatusBar from './MissionStatusBar.vue'

const {
  connection,
  clock,
  mission,
  uavs,
  selectedUavId,
  inspectorOpen,
  following,
  selectUav,
  focusSelected,
  toggleFollow,
  builder,
  canCreateMission,
  missionOverlay,
  missionActive,
  stopMission,
  stoppingMission,
} = useControlCenter()

/** Local presentation state: whether the fleet panel is expanded. */
const fleetOpen = ref(true)
</script>

<template>
  <div class="relative h-full overflow-hidden bg-canvas">
    <main class="absolute inset-0" aria-label="Operational map">
      <MapCanvas
        :uavs="uavs"
        :selected-uav-id="selectedUavId"
        :mission-overlay="missionOverlay"
        :drawing="builder.drawing.value"
        @select="selectUav"
        @draw="builder.addPoint"
      />
    </main>

    <!-- Floating panels. The overlay ignores pointer events so the map stays interactive. -->
    <div class="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
      <ControlCenterHeader
        :connection="connection"
        :clock="clock"
        :mission-title="mission.title"
        :can-create-mission="canCreateMission"
        @new-mission="builder.start()"
      />

      <div class="flex min-h-0 flex-1 items-start justify-between gap-3">
        <Transition
          mode="out-in"
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="-translate-x-2 opacity-0"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="-translate-x-2 opacity-0"
        >
          <BaseSurface
            v-if="builder.open.value"
            as="aside"
            variant="floating"
            class="pointer-events-auto flex max-h-full w-80 flex-col overflow-hidden"
            aria-label="Mission planning"
          >
            <MissionBuilderPanel />
          </BaseSurface>
          <BaseSurface
            v-else-if="fleetOpen"
            as="aside"
            variant="floating"
            class="pointer-events-auto flex max-h-full w-80 flex-col overflow-hidden"
            aria-label="Fleet"
          >
            <FleetPanel
              @select="selectUav($event, { focus: true })"
              @collapse="fleetOpen = false"
            />
          </BaseSurface>
          <BaseSurface v-else variant="floating" shape="pill" class="pointer-events-auto p-1">
            <BaseIconButton label="Show fleet panel" @click="fleetOpen = true">
              <PanelLeftOpen />
            </BaseIconButton>
          </BaseSurface>
        </Transition>

        <div class="flex h-full min-h-0 flex-col items-end gap-3">
          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="translate-x-2 opacity-0"
            leave-active-class="transition duration-150 ease-in"
            leave-to-class="translate-x-2 opacity-0"
          >
            <BaseSurface
              v-if="inspectorOpen"
              as="aside"
              variant="floating"
              class="pointer-events-auto flex max-h-full min-h-0 w-80 flex-col overflow-hidden"
              aria-label="UAV inspector"
            >
              <UavInspector
                :following="following"
                @close="selectUav(null)"
                @focus="focusSelected"
                @toggle-follow="toggleFollow"
              />
            </BaseSurface>
          </Transition>

          <MapControls :selected-uav-id="selectedUavId" class="pointer-events-auto mt-auto" />
        </div>
      </div>

      <!-- In the overlay flow so the panels above end at the regular gap instead of overlapping. -->
      <MissionStatusBar
        :state="mission.state"
        :detail="mission.detail"
        :progress="mission.progress"
        :can-stop="missionActive"
        :stopping="stoppingMission"
        @stop="stopMission"
      />
    </div>
  </div>
</template>

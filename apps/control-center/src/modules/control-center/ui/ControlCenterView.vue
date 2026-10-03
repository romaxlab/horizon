<script setup lang="ts">
import { PanelLeftOpen } from '@lucide/vue'
import { BaseButton, BaseIconButton, BaseSurface, BaseText } from '@horizon/ui'
import { ref, watch } from 'vue'
import { FleetPanel, UavInspector } from '@/modules/fleet'
import { MapCanvas, MapControls } from '@/modules/map'
import { DemoControlsPanel } from '@/modules/demo-controls'
import { EventFeed, IncidentAlerts } from '@/modules/incidents'
import { MissionBuilderPanel } from '@/modules/mission-planning'
import { VideoFeed } from '@/modules/video-monitoring'
import { useControlCenter } from '../model/useControlCenter'
import ControlCenterHeader from './ControlCenterHeader.vue'
import MissionStatusBar from './MissionStatusBar.vue'

const {
  connection,
  mission,
  fleetFeed,
  selectedUavId,
  inspectorOpen,
  following,
  selectUav,
  focusSelected,
  toggleFollow,
  builder,
  canCreateMission,
  missionOverlay,
  geofenceOverlay,
  selectedFeed,
  incidents,
  inspectIncident,
  demo,
  missionActive,
  stopMission,
  stoppingMission,
  stopError,
} = useControlCenter()

/** Local presentation state: fleet panel expansion and the large video focus view. */
const fleetOpen = ref(true)
const videoFocus = ref(false)
const eventsOpen = ref(false)
const {
  alerts,
  hiddenAlertCount,
  unreadCount,
  unreadAlerts,
  feed,
  acknowledge,
  clearHistory,
  markSeen,
} = incidents
// Opening the history (and new events while it is open) counts as seen.
watch([eventsOpen, unreadCount], ([open, unread]) => {
  if (open && unread > 0) markSeen()
})
watch(selectedUavId, (id) => {
  if (id === null) videoFocus.value = false
})
</script>

<template>
  <div class="relative h-full overflow-hidden bg-canvas">
    <main class="absolute inset-0" aria-label="Operational map">
      <MapCanvas
        :fleet="fleetFeed"
        :selected-uav-id="selectedUavId"
        :mission-overlay="missionOverlay"
        :geofences="geofenceOverlay"
        :drawing="builder.drawing.value"
        @select="selectUav"
        @draw="builder.addPoint"
      />
    </main>

    <!-- Floating panels. The overlay ignores pointer events so the map stays interactive. -->
    <div class="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
      <ControlCenterHeader
        :connection="connection"
        :mission-title="mission.title"
        :mission-context="mission.state"
        :can-create-mission="canCreateMission"
        :unread-count="unreadCount"
        :unread-alerts="unreadAlerts"
        :events-open="eventsOpen"
        @new-mission="builder.start()"
        @toggle-events="eventsOpen = !eventsOpen"
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

        <!-- Large floating video focus view; the map stays visible around it. -->
        <div class="flex min-w-0 flex-1 items-center justify-center self-stretch">
          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="scale-95 opacity-0"
            leave-active-class="transition duration-150 ease-in"
            leave-to-class="scale-95 opacity-0"
          >
            <BaseSurface
              v-if="videoFocus && selectedFeed"
              variant="floating"
              padding="sm"
              class="pointer-events-auto w-full max-w-3xl"
              aria-label="Video focus"
            >
              <VideoFeed
                variant="focus"
                :uav-id="selectedFeed.uavId"
                :label="selectedFeed.label"
                :pose="selectedFeed.pose"
                :link="selectedFeed.link"
                @close="videoFocus = false"
              />
            </BaseSurface>
          </Transition>
        </div>

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
              >
                <template v-if="selectedFeed" #media>
                  <!-- One renderer at a time: the preview yields while the focus view is open. -->
                  <BaseSurface
                    v-if="videoFocus"
                    variant="subtle"
                    class="flex h-10 items-center justify-between px-3"
                  >
                    <BaseText variant="body-sm" tone="secondary">Video open in focus view</BaseText>
                    <BaseButton size="sm" variant="ghost" @click="videoFocus = false">
                      Restore
                    </BaseButton>
                  </BaseSurface>
                  <VideoFeed
                    v-else
                    :uav-id="selectedFeed.uavId"
                    :label="selectedFeed.label"
                    :pose="selectedFeed.pose"
                    :link="selectedFeed.link"
                    @expand="videoFocus = true"
                  />
                </template>
              </UavInspector>
            </BaseSurface>
          </Transition>

          <MapControls :selected-uav-id="selectedUavId" class="pointer-events-auto mt-auto" />
        </div>
      </div>

      <!-- Bottom row in the overlay flow, so the panels above end at the regular gap. -->
      <div class="relative flex justify-center">
        <div v-if="demo" class="absolute bottom-0 left-0">
          <DemoControlsPanel :controls="demo" />
        </div>
        <MissionStatusBar
          :state="mission.state"
          :detail="mission.detail"
          :progress="mission.progress"
          :can-stop="missionActive"
          :stopping="stoppingMission"
          :stop-error="stopError"
          @stop="stopMission"
        />
      </div>
    </div>

    <!-- Alerts: top center, below the header. -->
    <div class="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
      <IncidentAlerts
        :alerts="alerts"
        :hidden-count="hiddenAlertCount"
        @inspect="inspectIncident"
        @dismiss="acknowledge"
      />
    </div>

    <!-- Event history, opened from the header bell. -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <BaseSurface
        v-if="eventsOpen"
        as="aside"
        variant="floating"
        class="absolute top-16 right-3 flex max-h-96 w-80 flex-col overflow-hidden"
        aria-label="Event history"
      >
        <EventFeed
          :events="feed"
          @inspect="inspectIncident(null, $event)"
          @close="eventsOpen = false"
          @clear="clearHistory"
        />
      </BaseSurface>
    </Transition>
  </div>
</template>

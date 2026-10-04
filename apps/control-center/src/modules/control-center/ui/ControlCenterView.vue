<script setup lang="ts">
import { PanelLeftOpen } from '@lucide/vue'
import { BaseButton, BaseIconButton, BasePopover, BaseSurface, BaseText } from '@horizon/ui'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { FleetPanel, UavInspector } from '@/modules/fleet'
import { MAP_ATTRIBUTION_TARGET_ID, MapCanvas, MapControls } from '@/modules/map'
import { DemoControlsPanel } from '@/modules/demo-controls'
import { EventFeed, IncidentAlerts } from '@/modules/incidents'
import { MissionBuilderPanel } from '@/modules/mission-planning'
import { VideoFeed } from '@/modules/video-monitoring'
import { useControlCenter } from '../model/useControlCenter'
import ControlCenterHeader from './ControlCenterHeader.vue'
import MissionDetailsPanel from './MissionDetailsPanel.vue'
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
  selectedMission,
  setMapViewportInsets,
  missionUavs,
} = useControlCenter()

// The free map area between the panels, reported as insets for camera framing.
/** Side panels: fixed width on larger screens, full width on phones. */
const SIDE_PANEL_CLASS =
  'pointer-events-auto flex max-h-full w-80 flex-col overflow-hidden max-sm:w-full'

/**
 * Phones (below `sm`) show one surface at a time; this decides which one owns the screen. Larger
 * screens ignore it (all classes it drives are `max-sm:` variants).
 */
const phoneSurface = computed<'video' | 'inspector' | 'side-panel' | 'map'>(() => {
  if (videoFocus.value && selectedFeed.value) return 'video'
  // A collapsed inspector gives the screen back to the map (it shows as a bar below it).
  if (inspectorOpen.value) return inspectorCollapsed.value ? 'map' : 'inspector'
  if (builder.open.value || fleetOpen.value) return 'side-panel'
  return 'map'
})
const hiddenOnPhoneUnless = (...surfaces: (typeof phoneSurface.value)[]) =>
  surfaces.includes(phoneSurface.value) ? '' : 'max-sm:hidden'
/** A collapsed inspector rides along with the map on phones, as a bar below it. */
const inspectorBar = computed(
  () => inspectorOpen.value && inspectorCollapsed.value && phoneSurface.value === 'map',
)

/** Below this free width a panel covers the map (phones): there is nothing to frame around. */
const MIN_FRAMED_WIDTH_PX = 160

const freeArea = useTemplateRef<HTMLElement>('freeArea')
function reportFreeArea() {
  const rect = freeArea.value?.getBoundingClientRect()
  if (!rect) return
  // Hidden on phones while a panel fills the screen: nothing to frame around.
  if (rect.width === 0 && rect.height === 0) {
    setMapViewportInsets({ top: 0, right: 0, bottom: 0, left: 0 })
    return
  }
  const covered = rect.width < MIN_FRAMED_WIDTH_PX
  setMapViewportInsets({
    top: Math.round(rect.top),
    left: covered ? 0 : Math.round(rect.left),
    right: covered ? 0 : Math.round(window.innerWidth - rect.right),
    bottom: Math.round(window.innerHeight - rect.bottom),
  })
}
const freeAreaObserver = new ResizeObserver(reportFreeArea)
onMounted(() => {
  if (freeArea.value) freeAreaObserver.observe(freeArea.value)
  reportFreeArea()
})
onBeforeUnmount(() => {
  freeAreaObserver.disconnect()
})

/** Local presentation state: per-UAV mission details shown above the status bar. */
const detailsOpen = ref(false)
function inspectMissionUav(uavId: string) {
  selectUav(uavId, { focus: true })
}

/** Local presentation state: fleet panel expansion and the large video focus view. */
// Phones open on the map; the fleet list would cover it (initial state only).
const fleetOpen = ref(window.innerWidth >= 640)
const videoFocus = ref(false)
/** Kept across selections: once collapsed, the inspector stays compact until expanded. */
const inspectorCollapsed = ref(false)
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
      <!-- data-reveal: groups of the staged startup reveal (app/startup); inert without it. -->
      <ControlCenterHeader
        v-model:events-open="eventsOpen"
        data-reveal="0"
        :connection="connection"
        :mission-title="mission.title"
        :can-create-mission="canCreateMission"
        :unread-count="unreadCount"
        :unread-alerts="unreadAlerts"
        @new-mission="builder.start()"
      >
        <template #events>
          <EventFeed
            :events="feed"
            @inspect="inspectIncident(null, $event)"
            @close="eventsOpen = false"
            @clear="clearHistory"
          />
        </template>
      </ControlCenterHeader>

      <!-- Above the bottom row's attribution, which panels may cover on small screens. -->
      <div
        class="relative z-10 flex min-h-0 flex-1 items-start justify-between gap-3"
        :class="{ 'max-sm:flex-col': inspectorBar }"
      >
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
            :class="[SIDE_PANEL_CLASS, hiddenOnPhoneUnless('side-panel')]"
            data-reveal="1"
            aria-label="Mission planning"
          >
            <MissionBuilderPanel />
          </BaseSurface>
          <BaseSurface
            v-else-if="fleetOpen"
            as="aside"
            variant="floating"
            :class="[SIDE_PANEL_CLASS, hiddenOnPhoneUnless('side-panel')]"
            data-reveal="1"
            aria-label="Fleet"
          >
            <FleetPanel
              @select="selectUav($event, { focus: true })"
              @collapse="fleetOpen = false"
            />
          </BaseSurface>
          <BaseSurface
            v-else
            variant="floating"
            shape="pill"
            class="pointer-events-auto p-1"
            :class="hiddenOnPhoneUnless('map')"
            data-reveal="1"
          >
            <BaseIconButton label="Show fleet panel" @click="fleetOpen = true">
              <PanelLeftOpen />
            </BaseIconButton>
          </BaseSurface>
        </Transition>

        <!-- Large floating video focus view; the map stays visible around it. This column is
             also the map area the panels leave free, measured for camera framing. -->
        <div
          ref="freeArea"
          class="flex min-w-0 flex-1 items-center justify-center self-stretch"
          :class="hiddenOnPhoneUnless('video', 'map')"
        >
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

        <div
          class="flex min-h-0 flex-col items-end gap-3"
          :class="
            inspectorBar
              ? 'h-full max-sm:h-auto max-sm:w-full'
              : ['h-full max-sm:flex-1', hiddenOnPhoneUnless('inspector')]
          "
        >
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
              :class="[SIDE_PANEL_CLASS, 'min-h-0']"
              aria-label="UAV inspector"
            >
              <UavInspector
                :following="following"
                :mission="selectedMission"
                :collapsed="inspectorCollapsed"
                @close="selectUav(null)"
                @toggle-collapsed="inspectorCollapsed = !inspectorCollapsed"
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
        </div>
      </div>

      <!-- Bottom row in the overlay flow, so the panels above end at the regular gap. Three
           slots: equal flex-1 sides keep the status bar exactly centered, no absolute layout. -->
      <div class="relative flex items-end gap-3 max-sm:flex-wrap">
        <!-- Map attribution, right-aligned above the whole row (also when it wraps on phones). -->
        <div
          :id="MAP_ATTRIBUTION_TARGET_ID"
          class="absolute right-0 bottom-full mb-2"
          data-reveal="3"
        />
        <div class="flex min-w-0 flex-1 justify-start" data-reveal="3">
          <DemoControlsPanel v-if="demo" :controls="demo" />
        </div>
        <BasePopover
          id="mission-details"
          :open="detailsOpen && missionUavs.length > 0"
          label="Mission details"
          placement="top"
          align="center"
          panel-class="flex w-96 flex-col overflow-hidden"
          max-height="20rem"
          class="flex shrink-0 max-sm:order-first max-sm:w-full"
          data-reveal="2"
          @update:open="detailsOpen = $event"
        >
          <template #trigger>
            <MissionStatusBar
              :state="mission.state"
              :detail="mission.detail"
              :phases="mission.phases"
              :progress="mission.progress"
              :can-stop="missionActive"
              :stopping="stoppingMission"
              :stop-error="stopError"
              :details-open="missionUavs.length > 0 ? detailsOpen : null"
              @stop="stopMission"
              @toggle-details="detailsOpen = !detailsOpen"
            />
          </template>
          <MissionDetailsPanel :uavs="missionUavs" @inspect="inspectMissionUav" />
        </BasePopover>
        <div class="flex min-w-0 flex-1 justify-end" data-reveal="3">
          <MapControls class="pointer-events-auto" />
        </div>
      </div>
    </div>

    <!-- Alerts: top center, below the header. -->
    <div class="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-3">
      <IncidentAlerts
        :alerts="alerts"
        :hidden-count="hiddenAlertCount"
        @inspect="inspectIncident"
        @dismiss="acknowledge"
      />
    </div>
  </div>
</template>

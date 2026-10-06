import type { MapBasemap } from '../store/map.store'

/*
 * Basemap attribution exactly as the Esri services publish it (`copyrightText` in their
 * metadata). Kept free of Cesium so the UI can show it without loading the 3D engine, and shown
 * by the UI itself: during the basemap cross-fade Cesium would list both layers' credits.
 */
const CANVAS_CREDIT = 'Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community'
const IMAGERY_CREDIT = 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community'

/**
 * Element the map canvas renders its attribution into; the composing layout places it (above
 * the bottom row, right-aligned) so it never sits on top of other controls.
 */
export const MAP_ATTRIBUTION_TARGET_ID = 'map-attribution'

/**
 * Esri credit for the basemap; null when Satellite comes from Cesium ion, whose imagery credits
 * Cesium renders itself.
 */
export function basemapCredit(basemap: MapBasemap, ionImagery: boolean): string | null {
  if (basemap === 'satellite') return ionImagery ? null : IMAGERY_CREDIT
  return CANVAS_CREDIT
}

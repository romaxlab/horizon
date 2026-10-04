import { Color } from 'cesium'

/** Map colors resolved from the active theme's semantic tokens (no raw values in map code). */
export interface MapPalette {
  canvas: Color
  surface: Color
  /** Raised surface (tooltips, map labels). */
  surfaceRaised: Color
  textPrimary: Color
  standby: Color
  active: Color
  warning: Color
  danger: Color
  selected: Color
  /** Halo around markers and badges; legible on any basemap. */
  halo: Color
  shadow: Color
  /** Selection ring around the selected UAV marker. */
  markerSelection: Color
  /** 3D OSM buildings. */
  building: Color
}

export function readMapPalette(root: HTMLElement = document.documentElement): MapPalette {
  const styles = getComputedStyle(root)
  const token = (name: string) => {
    // Typed as always returning a Color, but yields undefined for unparseable input.
    const parsed = Color.fromCssColorString(styles.getPropertyValue(name).trim()) as
      Color | undefined
    return parsed ?? Color.GRAY
  }

  return {
    canvas: token('--bg-canvas'),
    surface: token('--bg-surface'),
    surfaceRaised: token('--bg-surface-raised'),
    textPrimary: token('--text-primary'),
    standby: token('--status-neutral'),
    active: token('--status-info'),
    warning: token('--status-warning'),
    danger: token('--status-danger'),
    selected: token('--action-primary'),
    halo: token('--map-marker-halo'),
    shadow: token('--map-marker-shadow'),
    markerSelection: token('--map-marker-selection'),
    building: token('--map-building'),
  }
}

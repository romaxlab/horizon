/** Compact relative age for operational UI: "now", "12s ago", "3m ago", "2h ago". */
export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 2) return 'now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** Heading in degrees to an 8-point compass label. */
export function formatCardinal(heading: number): string {
  const index = Math.round((((heading % 360) + 360) % 360) / 45) % CARDINALS.length
  return CARDINALS[index] ?? 'N'
}

/** Duration as m:ss, or h:mm:ss beyond an hour. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

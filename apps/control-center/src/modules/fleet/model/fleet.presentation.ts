import type { UavStatus } from '@horizon/domain'
import type { BadgeVariant } from '@horizon/ui'

export const uavStatusPresentation: Record<UavStatus, { label: string; variant: BadgeVariant }> = {
  standby: { label: 'Standby', variant: 'neutral' },
  active: { label: 'Active', variant: 'info' },
  warning: { label: 'Warning', variant: 'warning' },
  stale: { label: 'Stale', variant: 'warning' },
  offline: { label: 'Offline', variant: 'danger' },
}

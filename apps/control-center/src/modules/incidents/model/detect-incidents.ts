import {
  severityOf,
  type NewIncident,
  type Observation,
  type Resolution,
  type UavObservation,
} from './incident.types'

export interface DetectionResult {
  incidents: NewIncident[]
  resolutions: Resolution[]
}

function uavIncident(
  type: NewIncident['type'],
  uav: UavObservation,
  missionId: string | null,
  detail: string | null = null,
): NewIncident {
  return { type, severity: severityOf[type], uavId: uav.id, uavName: uav.name, missionId, detail }
}

/**
 * Operational events from two consecutive observations. The first observation only sets the
 * baseline. During a backend outage a single CONNECTION_LOST replaces per-UAV link noise, and
 * the fleet resyncs silently afterwards.
 */
export function detectIncidents(previous: Observation | null, next: Observation): DetectionResult {
  const incidents: NewIncident[] = []
  const resolutions: Resolution[] = []
  if (!previous) return { incidents, resolutions }
  const missionId = next.mission?.status === 'active' ? next.mission.id : null

  // Backend link.
  if (previous.backendLive && !next.backendLive) {
    incidents.push({
      type: 'CONNECTION_LOST',
      severity: 'critical',
      uavId: null,
      uavName: null,
      missionId,
      detail: 'Realtime link to the backend lost · reconnecting',
    })
  } else if (!previous.backendLive && next.backendLive) {
    incidents.push({
      type: 'CONNECTION_RESTORED',
      severity: 'info',
      uavId: null,
      uavName: null,
      missionId,
      detail: 'Backend link restored · state resynced',
    })
    resolutions.push({ uavId: null, types: ['CONNECTION_LOST'] })
  }

  // Mission lifecycle.
  const before = previous.mission
  const after = next.mission
  if (after && (before?.id !== after.id || before.status !== after.status)) {
    const type =
      after.status === 'active'
        ? 'MISSION_STARTED'
        : after.status === 'completed'
          ? 'MISSION_COMPLETED'
          : after.status === 'aborted'
            ? 'MISSION_ABORTED'
            : null
    if (type) {
      incidents.push({
        type,
        severity: severityOf[type],
        uavId: null,
        uavName: null,
        missionId: after.id,
        detail: after.name,
      })
    }
  }

  // Per-UAV conditions; link transitions only while the backend itself is reachable.
  const previousById = new Map(previous.uavs.map((u) => [u.id, u]))
  for (const uav of next.uavs) {
    const was = previousById.get(uav.id)
    if (!was) continue

    if (uav.lowBattery && !was.lowBattery) {
      const battery = uav.battery === null ? null : `${Math.round(uav.battery)}%`
      incidents.push(uavIncident('LOW_BATTERY', uav, missionId, battery))
    }
    if (!uav.lowBattery && was.lowBattery)
      resolutions.push({ uavId: uav.id, types: ['LOW_BATTERY'] })

    if (uav.weakSignal && !was.weakSignal)
      incidents.push(uavIncident('SIGNAL_DEGRADED', uav, missionId))
    if (!uav.weakSignal && was.weakSignal) {
      resolutions.push({ uavId: uav.id, types: ['SIGNAL_DEGRADED'] })
    }

    if (!next.backendLive || !previous.backendLive || uav.link === was.link) continue
    if (uav.link === 'stale' && was.link === 'fresh') {
      incidents.push(uavIncident('TELEMETRY_STALE', uav, missionId, 'No telemetry for 5 s'))
    } else if (uav.link === 'offline') {
      incidents.push(uavIncident('CONNECTION_LOST', uav, missionId, 'Telemetry lost'))
      resolutions.push({ uavId: uav.id, types: ['TELEMETRY_STALE'] })
    } else if (uav.link === 'fresh') {
      incidents.push(uavIncident('CONNECTION_RESTORED', uav, missionId, 'Telemetry restored'))
      resolutions.push({ uavId: uav.id, types: ['TELEMETRY_STALE', 'CONNECTION_LOST'] })
    }
  }

  return { incidents, resolutions }
}

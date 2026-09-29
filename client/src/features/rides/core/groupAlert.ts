/**
 * The ride's safety flow: an alert to everyone on the ride, with a hand-off
 * to 112 that the rider places themselves.
 *
 * It is never called SOS and never claims to contact emergency services
 * (launch readiness D8). The app cannot guarantee help, so it says what it
 * does, hands a real emergency to 112, and gets the alert to the group.
 */

export const GROUP_ALERT_KIND = "group_alert";
/** What builds before the rename sent, and what old incidents may still say. */
export const LEGACY_GROUP_ALERT_KIND = "sos";

export const EMERGENCY_NUMBER = "112";
/** Opens the dialer with the number filled in. The rider presses call. */
export const EMERGENCY_DIAL_URL = `tel:${EMERGENCY_NUMBER}`;

export const GROUP_ALERT_DISCLAIMER =
  "ThrottleBase alerts the riders in your group. It is not an emergency service and does not contact police, ambulance or fire services. In an emergency, call 112. Alerts need network coverage and may be delayed.";

/** An alert this old is history, not something to put in front of the group. */
export const GROUP_ALERT_SHOW_FOR_MS = 30 * 60 * 1000;

export interface AlertIncident {
  incidentId: string;
  riderId: string;
  kind: string;
  createdAt: string;
  lon?: number;
  lat?: number;
}

export const isGroupAlert = (kind: string): boolean =>
  kind === GROUP_ALERT_KIND || kind === LEGACY_GROUP_ALERT_KIND;

/**
 * The alert to show this rider: the newest group alert from someone else on
 * the ride that they have not dismissed and that is recent enough to matter.
 */
export const alertToShow = <T extends AlertIncident>(
  incidents: readonly T[],
  myRiderId: string | null | undefined,
  dismissedIds: ReadonlySet<string>,
  nowMs: number,
): T | null => {
  let newest: T | null = null;
  let newestAt = -Infinity;

  for (const incident of incidents) {
    if (!isGroupAlert(incident.kind)) continue;
    if (incident.riderId === myRiderId) continue;
    if (dismissedIds.has(incident.incidentId)) continue;

    const createdAt = Date.parse(incident.createdAt);
    if (!Number.isFinite(createdAt) || nowMs - createdAt > GROUP_ALERT_SHOW_FOR_MS) continue;

    if (createdAt > newestAt) {
      newest = incident;
      newestAt = createdAt;
    }
  }

  return newest;
};

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Where to send someone riding to the rider who raised the alert: their live
 * position when the group has one, else where they were when they raised it.
 */
export const alertPosition = (
  incident: AlertIncident,
  livePosition: LatLon | null | undefined,
): LatLon | null => {
  if (livePosition) return livePosition;
  if (incident.lat !== undefined && incident.lon !== undefined) {
    return { lat: incident.lat, lon: incident.lon };
  }
  return null;
};

/** Directions in Google Maps, which opens the app when installed, else the web. */
export const directionsUrl = ({ lat, lon }: LatLon): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}&travelmode=driving`;

/** "just now", "4 min ago": how long since the alert went out. */
export const alertAgeLabel = (createdAt: string, nowMs: number): string => {
  const minutes = Math.floor((nowMs - Date.parse(createdAt)) / 60_000);
  return minutes < 1 ? "just now" : `${minutes} min ago`;
};

import { query } from "../../config/db.js";
import { createNotificationsForRiders } from "../../services/notifications.service.js";

type EscalatableIncident = {
  incident_id: string;
  session_id: string;
  ride_id: string;
  ride_title: string;
  severity: "high" | "critical";
  kind: string;
  reporter_rider_id: string | null;
  age_seconds: number;
};

const PRESENCE_STALE_SECONDS = 120;
const INCIDENT_ESCALATION_DELAY_SECONDS = 120;

const getEscalationRecipients = async (
  rideId: string,
  reporterRiderId: string | null,
): Promise<string[]> => {
  const result = await query(
    `SELECT rider_id::text AS rider_id
     FROM (
       SELECT r.captain_id AS rider_id
       FROM rides r
       WHERE r.id = $1
       UNION
       SELECT rp.rider_id
       FROM ride_participants rp
       WHERE rp.ride_id = $1
         AND rp.status = 'confirmed'
         AND rp.role = 'co_captain'
     ) leaders
     WHERE $2::uuid IS NULL OR rider_id <> $2::uuid`,
    [rideId, reporterRiderId],
  );

  return result.rows.map((row) => row.rider_id as string);
};

const getEscalatableIncidents = async (): Promise<EscalatableIncident[]> => {
  const result = await query(
    `SELECT i.id AS incident_id,
            i.session_id,
            s.ride_id,
            r.title AS ride_title,
            i.severity,
            i.kind,
            i.rider_id AS reporter_rider_id,
            EXTRACT(EPOCH FROM (now() - i.created_at))::int AS age_seconds
     FROM ride_live_incidents i
     JOIN ride_live_sessions s ON s.id = i.session_id
     JOIN rides r ON r.id = s.ride_id
     WHERE i.status = 'open'
       AND i.severity IN ('high', 'critical')
       AND i.created_at <= now() - ($1 || ' seconds')::interval
       AND NOT EXISTS (
         SELECT 1
         FROM notifications n
         WHERE n.type = 'live_incident_unacknowledged'
           AND n.data->>'incident_id' = i.id::text
       )
     ORDER BY i.created_at ASC
     LIMIT 50`,
    [String(INCIDENT_ESCALATION_DELAY_SECONDS)],
  );

  return result.rows as EscalatableIncident[];
};

export const processLivePresenceSweep = async (): Promise<
  Record<string, unknown>
> => {
  const result = await query(
    `WITH stale AS (
       SELECT p.session_id, p.rider_id
       FROM ride_live_presence p
       JOIN ride_live_sessions s ON s.id = p.session_id
       WHERE p.is_online = true
         AND s.status IN ('starting', 'active', 'paused')
         AND (
           p.last_heartbeat_at IS NULL
           OR p.last_heartbeat_at <= now() - ($1 || ' seconds')::interval
         )
     )
     UPDATE ride_live_presence p
     SET is_online = false,
         updated_at = now()
     FROM stale
     WHERE p.session_id = stale.session_id
       AND p.rider_id = stale.rider_id
     RETURNING p.session_id, p.rider_id`,
    [String(PRESENCE_STALE_SECONDS)],
  );

  return {
    processor: "live-presence-sweep",
    staleSeconds: PRESENCE_STALE_SECONDS,
    markedOffline: result.rowCount ?? 0,
    handledAt: new Date().toISOString(),
  };
};

export const processLiveIncidentEscalation = async (): Promise<
  Record<string, unknown>
> => {
  const incidents = await getEscalatableIncidents();

  let escalated = 0;

  for (const incident of incidents) {
    const recipientIds = await getEscalationRecipients(
      incident.ride_id,
      incident.reporter_rider_id,
    );

    if (recipientIds.length === 0) {
      continue;
    }

    const rideLabel = incident.ride_title || "the ride";
    const title =
      incident.severity === "critical"
        ? "Critical incident needs acknowledgement"
        : "High-priority incident needs acknowledgement";

    const body =
      incident.severity === "critical"
        ? `A critical ${incident.kind} incident is still unacknowledged on ${rideLabel}. Please respond immediately.`
        : `A high-priority ${incident.kind} incident is still unacknowledged on ${rideLabel}. Please review.`;

    const notificationOutcome = await createNotificationsForRiders({
      riderIds: recipientIds,
      type: "live_incident_unacknowledged",
      title,
      body,
      data: {
        incident_id: incident.incident_id,
        session_id: incident.session_id,
        ride_id: incident.ride_id,
        severity: incident.severity,
        kind: incident.kind,
        age_seconds: incident.age_seconds,
        event: "live_session.incident_escalated",
      },
      dedupeKey: `live_incident_unacknowledged:${incident.incident_id}`,
    });

    if ((notificationOutcome.inserted ?? 0) > 0) {
      escalated += 1;

      await query(
        `INSERT INTO ride_live_events (session_id, actor_rider_id, event_type, payload)
         VALUES ($1, NULL, 'incident_escalated', $2::jsonb)`,
        [
          incident.session_id,
          JSON.stringify({
            incident_id: incident.incident_id,
            severity: incident.severity,
            kind: incident.kind,
            recipients: notificationOutcome.inserted,
          }),
        ],
      );
    }
  }

  return {
    processor: "live-incident-escalation",
    delaySeconds: INCIDENT_ESCALATION_DELAY_SECONDS,
    scanned: incidents.length,
    escalated,
    handledAt: new Date().toISOString(),
  };
};

import { query } from "../../config/db.js";
import { createNotificationsForRiders } from "../../services/notifications.service.js";

type IncidentDetails = {
  incident_id: string;
  session_id: string;
  ride_id: string;
  ride_title: string;
  severity: string;
  kind: string;
  status: string;
  reporter_rider_id: string | null;
};

const getRideRecipientIds = async (rideId: string): Promise<string[]> => {
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
     ) recipients`,
    [rideId],
  );

  return result.rows.map((row) => row.rider_id as string);
};

const getRiderName = async (riderId: string | null): Promise<string | null> => {
  if (!riderId) {
    return null;
  }

  const result = await query(
    `SELECT display_name
     FROM riders
     WHERE id = $1`,
    [riderId],
  );

  return (result.rows[0]?.display_name as string | undefined) ?? null;
};

const getIncidentDetails = async (
  incidentId: string,
): Promise<IncidentDetails | null> => {
  const result = await query(
    `SELECT i.id AS incident_id,
            i.session_id,
            s.ride_id,
            r.title AS ride_title,
            i.severity,
            i.kind,
            i.status,
            i.rider_id AS reporter_rider_id
     FROM ride_live_incidents i
     JOIN ride_live_sessions s ON s.id = i.session_id
     JOIN rides r ON r.id = s.ride_id
     WHERE i.id = $1`,
    [incidentId],
  );

  return (result.rows[0] as IncidentDetails | undefined) ?? null;
};

const buildIncidentTitle = (severity: string): string => {
  if (severity === "critical") {
    return "Critical incident reported";
  }

  if (severity === "high") {
    return "High-priority incident reported";
  }

  return "Incident reported during live ride";
};

export const processLiveIncidentReported = async (
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const incidentId =
    typeof payload.incidentId === "string" ? payload.incidentId : null;
  const rideId = typeof payload.rideId === "string" ? payload.rideId : null;

  if (!incidentId) {
    throw new Error(
      "incidentId is required for live_session.incident_reported job",
    );
  }

  if (!rideId) {
    throw new Error(
      "rideId is required for live_session.incident_reported job",
    );
  }

  const payloadReporterRiderId =
    typeof payload.reporterRiderId === "string" &&
    payload.reporterRiderId.length > 0
      ? payload.reporterRiderId
      : null;

  const incidentDetails = await getIncidentDetails(incidentId);
  if (!incidentDetails) {
    throw new Error(
      `Incident ${incidentId} not found for live_session.incident_reported job`,
    );
  }

  if (incidentDetails.ride_id !== rideId) {
    throw new Error(
      `Incident ${incidentId} is not linked to ride ${rideId} in live_session.incident_reported job`,
    );
  }

  const reporterRiderId =
    payloadReporterRiderId ?? incidentDetails.reporter_rider_id;
  const reporterName = await getRiderName(reporterRiderId);
  const reporterLabel = reporterName ?? "A participant";
  const recipientIds = (await getRideRecipientIds(rideId)).filter(
    (riderIdValue) => riderIdValue !== reporterRiderId,
  );

  const title = buildIncidentTitle(incidentDetails.severity);
  const rideLabel = incidentDetails.ride_title || "the ride";
  const baseBody = `${reporterLabel} reported a ${incidentDetails.kind} incident on ${rideLabel}.`;
  const body =
    incidentDetails.severity === "critical"
      ? `${baseBody} Immediate attention recommended.`
      : baseBody;

  const notificationOutcome = await createNotificationsForRiders({
    riderIds: recipientIds,
    type: "live_incident_reported",
    title,
    body,
    data: {
      incident_id: incidentDetails.incident_id,
      session_id: incidentDetails.session_id,
      ride_id: incidentDetails.ride_id,
      severity: incidentDetails.severity,
      kind: incidentDetails.kind,
      status: incidentDetails.status,
      reporter_rider_id: reporterRiderId,
      event: "live_session.incident_reported",
    },
    dedupeKey: `live_incident_reported:${incidentDetails.incident_id}`,
  });

  return {
    processor: "live-incident-reported",
    incidentId,
    rideId,
    severity: incidentDetails.severity,
    reporterRiderId,
    notificationOutcome,
    handledAt: new Date().toISOString(),
  };
};

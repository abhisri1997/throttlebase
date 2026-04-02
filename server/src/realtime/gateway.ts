import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { authenticateLiveSocket } from "./auth.js";
import { buildLiveRoomKey, buildRideSocketKey } from "./session-room.js";
import { query } from "../config/db.js";
import {
  CreateIncidentSchema,
  LiveLocationUpdateSchema,
} from "../schemas/live-session.schemas.js";
import {
  LiveSessionError,
  createLiveIncident,
  getLiveSession,
  markLivePresenceOffline,
  updateLivePresenceHeartbeat,
  updateLivePresenceLocation,
} from "../services/live-session.service.js";

type RiderPayload = {
  riderId: string;
  email: string;
};

const JoinPayloadSchema = z.object({
  rideId: z.string().uuid(),
});

const HeartbeatPayloadSchema = z.object({
  rideId: z.string().uuid(),
  ts: z.string().datetime().optional(),
});

const IncidentWithRideSchema = CreateIncidentSchema.extend({
  rideId: z.string().uuid(),
});

const LocationWithRideSchema = LiveLocationUpdateSchema.extend({
  rideId: z.string().uuid(),
});

const isAllowedSessionStatus = (status: string): boolean =>
  status === "starting" || status === "active" || status === "paused";

const locationSequence = new Map<string, number>();

const nextShouldPersistSample = (key: string): boolean => {
  const next = (locationSequence.get(key) ?? 0) + 1;
  locationSequence.set(key, next);
  return next % 3 === 0;
};

const emitSocketError = (socket: Socket, message: string, code = 400): void => {
  socket.emit("session:error", { error: message, code });
};

const clearLocationSequenceForRider = (riderId: string): void => {
  for (const key of locationSequence.keys()) {
    if (key.endsWith(`:${riderId}`)) {
      locationSequence.delete(key);
    }
  }
};

let _liveNamespace: ReturnType<InstanceType<typeof Server>["of"]> | null =
  null;

let _ridesNamespace: ReturnType<InstanceType<typeof Server>["of"]> | null =
  null;

export const emitToLiveRoom = (
  roomKey: string,
  event: string,
  data: unknown,
): void => {
  _liveNamespace?.to(roomKey).emit(event, data);
};

/**
 * Broadcast a ride-level event to all subscribers of a ride room.
 * Riders join `ride:<rideId>` rooms when they open ride detail pages.
 */
export const emitToRideRoom = (
  rideId: string,
  event: string,
  data: unknown,
): void => {
  _ridesNamespace?.to(`ride:${rideId}`).emit(event, data);
};

const canAccessRideRoom = async (
  rideId: string,
  riderId: string,
): Promise<boolean> => {
  const result = await query(
    `SELECT r.id
     FROM rides r
     WHERE r.id = $1
       AND (
         r.visibility = 'public'
         OR r.captain_id = $2
         OR EXISTS (
           SELECT 1
           FROM ride_participants rp
           WHERE rp.ride_id = r.id
             AND rp.rider_id = $2
             AND rp.status = 'confirmed'
         )
       )`,
    [rideId, riderId],
  );

  return result.rows.length > 0;
};

export const createLiveGateway = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  const liveNamespace = io.of("/live");
  _liveNamespace = liveNamespace;
  liveNamespace.use(authenticateLiveSocket);

  liveNamespace.on("connection", (socket) => {
    const rider = socket.data.rider as RiderPayload | undefined;
    const joinedRideIds = new Set<string>();

    if (!rider?.riderId) {
      emitSocketError(socket, "Authentication context missing", 401);
      socket.disconnect(true);
      return;
    }

    socket.on("session:join", async (rawPayload) => {
      try {
        const payload = JoinPayloadSchema.parse(rawPayload);
        const session = await getLiveSession(payload.rideId, rider.riderId);

        if (!isAllowedSessionStatus(session.status)) {
          emitSocketError(socket, "Live session is not active", 400);
          return;
        }

        const roomKey = buildLiveRoomKey(payload.rideId, session.id);
        await socket.join(roomKey);
        joinedRideIds.add(payload.rideId);

        const presence = await updateLivePresenceHeartbeat(
          payload.rideId,
          rider.riderId,
        );

        socket.emit("session:state", {
          id: session.id,
          ride_id: session.ride_id,
          status: session.status,
          started_at: session.started_at,
          ended_at: session.ended_at,
          participants: session.participants,
        });

        liveNamespace.to(roomKey).emit("presence:update", {
          riderId: presence.riderId,
          isOnline: presence.isOnline,
          lastHeartbeatAt: presence.lastHeartbeatAt,
        });
      } catch (error) {
        if (error instanceof LiveSessionError) {
          emitSocketError(socket, error.message, error.statusCode);
          return;
        }

        if (error instanceof z.ZodError) {
          emitSocketError(socket, "Invalid session:join payload", 400);
          return;
        }

        console.error("session:join error:", error);
        emitSocketError(socket, "Internal server error", 500);
      }
    });

    socket.on("session:leave", async (rawPayload) => {
      try {
        const payload = JoinPayloadSchema.parse(rawPayload);
        const session = await getLiveSession(payload.rideId, rider.riderId);
        const roomKey = buildLiveRoomKey(payload.rideId, session.id);

        const offline = await markLivePresenceOffline(
          payload.rideId,
          rider.riderId,
        );

        await socket.leave(roomKey);
        joinedRideIds.delete(payload.rideId);

        liveNamespace.to(roomKey).emit("presence:update", {
          riderId: offline.riderId,
          isOnline: offline.isOnline,
          lastHeartbeatAt: offline.lastHeartbeatAt,
        });
      } catch (error) {
        if (error instanceof LiveSessionError) {
          emitSocketError(socket, error.message, error.statusCode);
          return;
        }

        if (error instanceof z.ZodError) {
          emitSocketError(socket, "Invalid session:leave payload", 400);
          return;
        }

        console.error("session:leave error:", error);
        emitSocketError(socket, "Internal server error", 500);
      }
    });

    socket.on("presence:heartbeat", async (rawPayload) => {
      try {
        const payload = HeartbeatPayloadSchema.parse(rawPayload);
        const session = await getLiveSession(payload.rideId, rider.riderId);

        if (!isAllowedSessionStatus(session.status)) {
          emitSocketError(socket, "Live session is not active", 400);
          return;
        }

        const presence = await updateLivePresenceHeartbeat(
          payload.rideId,
          rider.riderId,
          payload.ts,
        );

        liveNamespace
          .to(buildLiveRoomKey(payload.rideId, session.id))
          .emit("presence:update", {
            riderId: presence.riderId,
            isOnline: presence.isOnline,
            lastHeartbeatAt: presence.lastHeartbeatAt,
          });
      } catch (error) {
        if (error instanceof LiveSessionError) {
          emitSocketError(socket, error.message, error.statusCode);
          return;
        }

        if (error instanceof z.ZodError) {
          emitSocketError(socket, "Invalid presence:heartbeat payload", 400);
          return;
        }

        console.error("presence:heartbeat error:", error);
        emitSocketError(socket, "Internal server error", 500);
      }
    });

    socket.on("location:update", async (rawPayload) => {
      try {
        const payload = LocationWithRideSchema.parse(rawPayload);
        const session = await getLiveSession(payload.rideId, rider.riderId);

        if (!isAllowedSessionStatus(session.status)) {
          emitSocketError(socket, "Live session is not active", 400);
          return;
        }

        const sequenceKey = buildRideSocketKey(payload.rideId, rider.riderId);
        const location = await updateLivePresenceLocation(
          payload.rideId,
          rider.riderId,
          {
            lon: payload.lon,
            lat: payload.lat,
            speed_kmh: payload.speed_kmh,
            heading_deg: payload.heading_deg,
            accuracy_m: payload.accuracy_m,
            captured_at: payload.captured_at,
          },
          { persistSample: nextShouldPersistSample(sequenceKey) },
        );

        if (!location) {
          return;
        }

        liveNamespace
          .to(buildLiveRoomKey(payload.rideId, session.id))
          .emit("location:broadcast", location);
      } catch (error) {
        if (error instanceof LiveSessionError) {
          emitSocketError(socket, error.message, error.statusCode);
          return;
        }

        if (error instanceof z.ZodError) {
          emitSocketError(socket, "Invalid location:update payload", 400);
          return;
        }

        console.error("location:update error:", error);
        emitSocketError(socket, "Internal server error", 500);
      }
    });

    socket.on("incident:create", async (rawPayload) => {
      try {
        const payload = IncidentWithRideSchema.parse(rawPayload);
        const incident = await createLiveIncident(
          payload.rideId,
          rider.riderId,
          {
            severity: payload.severity,
            kind: payload.kind,
            lon: payload.lon,
            lat: payload.lat,
            metadata: payload.metadata,
          },
        );

        const session = await getLiveSession(payload.rideId, rider.riderId);

        liveNamespace
          .to(buildLiveRoomKey(payload.rideId, session.id))
          .emit("incident:created", {
            incidentId: incident.id,
            riderId: rider.riderId,
            severity: incident.severity,
            kind: incident.kind,
            createdAt: incident.created_at,
          });
      } catch (error) {
        if (error instanceof LiveSessionError) {
          emitSocketError(socket, error.message, error.statusCode);
          return;
        }

        if (error instanceof z.ZodError) {
          emitSocketError(socket, "Invalid incident:create payload", 400);
          return;
        }

        console.error("incident:create error:", error);
        emitSocketError(socket, "Internal server error", 500);
      }
    });

    socket.on("disconnect", () => {
      for (const rideId of joinedRideIds) {
        void markLivePresenceOffline(rideId, rider.riderId).catch((error) => {
          if (!(error instanceof LiveSessionError)) {
            console.error("disconnect offline persistence error:", error);
          }
        });
      }

      clearLocationSequenceForRider(rider.riderId);
    });
  });

  // ── /rides namespace — lightweight ride-room subscription ──────────────────
  // Clients join `ride:<rideId>` rooms to receive broadcast events for that
  // ride without the full live-session authentication requirement.
  const ridesNamespace = io.of("/rides");
  _ridesNamespace = ridesNamespace;
  ridesNamespace.use(authenticateLiveSocket);

  ridesNamespace.on("connection", (socket) => {
    const rider = socket.data.rider as RiderPayload | undefined;

    if (!rider?.riderId) {
      socket.emit("ride:error", { error: "Authentication context missing", code: 401 });
      socket.disconnect(true);
      return;
    }

    socket.on("ride:subscribe", async (rawPayload) => {
      try {
        const payload = JoinPayloadSchema.parse(rawPayload);

        const allowed = await canAccessRideRoom(payload.rideId, rider.riderId);
        if (!allowed) {
          socket.emit("ride:error", {
            error: "Not allowed to subscribe to this ride",
            code: 403,
          });
          return;
        }

        void socket.join(`ride:${payload.rideId}`);
        socket.emit("ride:subscribed", { rideId: payload.rideId });
      } catch {
        socket.emit("ride:error", { error: "Invalid ride:subscribe payload", code: 400 });
      }
    });

    socket.on("ride:unsubscribe", (rawPayload) => {
      try {
        const payload = JoinPayloadSchema.parse(rawPayload);
        void socket.leave(`ride:${payload.rideId}`);
      } catch {
        // Ignore malformed unsubscribe
      }
    });
  });

  return io;
};

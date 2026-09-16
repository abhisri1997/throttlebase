import type { Request, Response } from "express";
import {
  CreateRideSchema,
  UpdateRideSchema,
  PromoteCoCaptainSchema,
  RequestStopSchema,
  RequestRegroupSchema,
  HandleStopSchema,
} from "../schemas/ride.schemas.js";
import * as RideService from "../services/ride.service.js";
import { emitToLiveRoom, emitToRideRoom } from "../realtime/gateway.js";
import { buildLiveRoomKey } from "../realtime/session-room.js";
import { getLiveSession } from "../services/live-session.service.js";

interface RiderPayload {
  riderId: string;
  email: string;
}

export const createRide = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const validatedData = CreateRideSchema.parse(req.body);
    const captainId = (req.rider as unknown as RiderPayload).riderId;

    const newRide = await RideService.createRide(captainId, validatedData);

    res.status(201).json({
      message: "Ride created successfully",
      ride: newRide,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res
        .status(400)
        .json({ error: "Validation failed", details: error.errors });
    } else {
      console.error("Error creating ride:", error);
      res
        .status(500)
        .json({ error: "Internal server error while creating ride" });
    }
  }
};

export const getRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const rideId = req.params.id as string;
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const ride = await RideService.getRideById(rideId, riderId);

    if (!ride) {
      res.status(404).json({ error: "Ride not found" });
      return;
    }

    res.json({ ride });
  } catch (error) {
    console.error("Error getting ride:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getAllRides = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const statusParam = String(req.query.status || "all").toLowerCase();
    const statusFilter: RideService.RideStatusFilter =
      statusParam === "draft" ||
      statusParam === "scheduled" ||
      statusParam === "active" ||
      statusParam === "all"
        ? statusParam
        : "all";
    const rides = await RideService.listDiscoverableRides(
      riderId,
      statusFilter,
    );
    res.json({ rides });
  } catch (error) {
    console.error("Error listing rides:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getHistory = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const rides = await RideService.getRideHistory(riderId);
    res.json({ rides });
  } catch (error) {
    console.error("Error listing ride history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateRide = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const validatedData = UpdateRideSchema.parse(req.body);
    const captainId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const updatedRide = await RideService.updateRideInfo(
      rideId,
      captainId,
      validatedData,
    );

    if (!updatedRide) {
      res.status(404).json({
        error: "Ride not found or you are not the captain/co-captain",
      });
      return;
    }

    res.json({ message: "Ride updated successfully", ride: updatedRide });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res
        .status(400)
        .json({ error: "Validation failed", details: error.errors });
    } else if (error.message?.startsWith("Invalid status transition")) {
      res.status(400).json({ error: error.message });
    } else {
      console.error("Error updating ride:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const deleteRide = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const captainId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const success = await RideService.deleteRide(rideId, captainId);

    if (!success) {
      res.status(400).json({
        error:
          "Cannot delete ride. Either you are not the captain, or the ride is already active/completed.",
      });
      return;
    }

    res.json({ message: "Ride deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting ride:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const joinRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const success = await RideService.joinRide(rideId, riderId);

    if (success) {
      emitToRideRoom(rideId, "ride:joined", { rideId, riderId });
      res.json({ message: "Successfully joined the ride" });
    } else {
      res
        .status(400)
        .json({ message: "You are already a participant of this ride" });
    }
  } catch (error: any) {
    if (error.message?.includes("maximum capacity")) {
      res.status(400).json({ error: error.message });
    } else if (error.message?.includes("Cannot join")) {
      res.status(400).json({ error: error.message });
    } else if (error.message === "Ride not found") {
      res.status(404).json({ error: "Ride not found" });
    } else {
      console.error("Error joining ride:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

// ---- Co-Captain Promotion ----

export const promoteCoCaptain = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const validated = PromoteCoCaptainSchema.parse(req.body);
    const captainId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const success = await RideService.promoteToCoCaptain(
      rideId,
      captainId,
      validated.rider_id,
    );

    if (success) {
      res.json({ message: "Rider promoted to co-captain successfully" });
    } else {
      res.status(400).json({
        error:
          "Could not promote rider. Either you are not the captain, or the target is not a confirmed participant.",
      });
    }
  } catch (error: any) {
    if (error.name === "ZodError") {
      res
        .status(400)
        .json({ error: "Validation failed", details: error.errors });
    } else {
      console.error("Error promoting co-captain:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

// ---- Ride Stops ----

export const requestStop = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const validated = RequestStopSchema.parse(req.body);
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const stop = await RideService.requestStop(rideId, riderId, validated);

    if (stop) {
      emitToRideRoom(rideId, "ride:stop_requested", { rideId, stop });
      res.status(201).json({ message: "Stop request submitted", stop });
    } else {
      res
        .status(403)
        .json({ error: "You are not a confirmed participant of this ride" });
    }
  } catch (error: any) {
    if (error.name === "ZodError") {
      res
        .status(400)
        .json({ error: "Validation failed", details: error.errors });
    } else {
      console.error("Error requesting stop:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

/**
 * A rider who has fallen behind proposes somewhere for the group to wait.
 *
 * It is an ordinary pending stop, so the captain's existing approve/reject
 * flow applies and an accepted one becomes a waypoint for everybody. The
 * difference is reach: this also goes to the live room, because the captain
 * who needs to answer is riding, not sitting on the ride screen.
 */
export const requestRegroup = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const validated = RequestRegroupSchema.parse(req.body);
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const stop = await RideService.requestStop(rideId, riderId, {
      type: "rest",
      location_coords: validated.location_coords,
      name: validated.name,
      address: validated.address,
      google_place_id: validated.google_place_id,
    } as any);

    if (!stop) {
      res
        .status(403)
        .json({ error: "You are not a confirmed participant of this ride" });
      return;
    }

    emitToRideRoom(rideId, "ride:stop_requested", { rideId, stop });

    const payload = {
      rideId,
      stop,
      requestedBy: riderId,
      waitSeconds: validated.wait_seconds ?? null,
    };

    try {
      const session = await getLiveSession(rideId, riderId);
      emitToLiveRoom(
        buildLiveRoomKey(rideId, session.id),
        "regroup:requested",
        payload,
      );
    } catch (error: unknown) {
      // No live session to shout into; the stop still stands on the ride screen.
      console.warn("Regroup requested without a live session:", error);
    }

    res.status(201).json({ message: "Regroup requested", stop });
  } catch (error: any) {
    if (error.name === "ZodError") {
      res
        .status(400)
        .json({ error: "Validation failed", details: error.errors });
    } else {
      console.error("Error requesting regroup:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const handleStopRequest = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const validated = HandleStopSchema.parse(req.body);
    const captainId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;
    const stopId = req.params.stopId as string;

    const success = await RideService.handleStopRequest(
      rideId,
      stopId,
      captainId,
      validated.status,
    );

    if (success) {
      emitToRideRoom(rideId, "ride:stop_updated", { rideId, stopId, status: validated.status });

      // Riders in navigation are in the live room, not the ride room, and an
      // approved stop changes the route they are following right now.
      try {
        const session = await getLiveSession(rideId, captainId);
        emitToLiveRoom(buildLiveRoomKey(rideId, session.id), "regroup:decided", {
          rideId,
          stopId,
          status: validated.status,
          decidedBy: captainId,
        });
      } catch {
        // Not riding yet; the ride-room broadcast above is enough.
      }

      res.json({ message: `Stop request ${validated.status}` });
    } else {
      res.status(400).json({
        error:
          "Could not update stop. Either you are not a captain/co-captain, or the stop is not pending.",
      });
    }
  } catch (error: any) {
    if (error.name === "ZodError") {
      res
        .status(400)
        .json({ error: "Validation failed", details: error.errors });
    } else {
      console.error("Error handling stop request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

export const getRideStops = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const rideId = req.params.id as string;
    const stops = await RideService.listRideStops(rideId);
    res.json({ stops });
  } catch (error) {
    console.error("Error listing stops:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateStartLocation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const { location_coords } = req.body;

    if (!Array.isArray(location_coords) || location_coords.length !== 2) {
      res
        .status(400)
        .json({ error: "location_coords must be an array of [lng, lat]" });
      return;
    }

    await RideService.updateStartLocationOverride(
      rideId,
      riderId,
      location_coords as [number, number],
    );

    res.json({ message: "Start location updated successfully" });
  } catch (error: any) {
    if (error.message === "Ride not found") {
      res.status(404).json({ error: error.message });
    } else if (
      error.message.includes("12 hours") ||
      error.message.includes("confirmed") ||
      error.message.includes("auto-calculate")
    ) {
      res.status(400).json({ error: error.message });
    } else {
      console.error("Error updating start location:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

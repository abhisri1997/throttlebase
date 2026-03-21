import type { Request, Response } from 'express';
import {
  CreateRideSchema,
  UpdateRideSchema,
  PromoteCoCaptainSchema,
  RequestStopSchema,
  HandleStopSchema,
} from '../schemas/ride.schemas.js';
import * as RideService from '../services/ride.service.js';

interface RiderPayload {
  riderId: string;
  email: string;
}

export const createRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = CreateRideSchema.parse(req.body);
    const captainId = (req.rider as unknown as RiderPayload).riderId;

    const newRide = await RideService.createRide(captainId, validatedData);
    
    res.status(201).json({
      message: 'Ride created successfully',
      ride: newRide
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else {
      console.error('Error creating ride:', error);
      res.status(500).json({ error: 'Internal server error while creating ride' });
    }
  }
};

export const getRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const rideId = req.params.id as string;
    const ride = await RideService.getRideById(rideId);
    
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }
    
    res.json({ ride });
  } catch (error) {
    console.error('Error getting ride:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllRides = async (req: Request, res: Response): Promise<void> => {
  try {
    const rides = await RideService.listDiscoverableRides();
    res.json({ rides });
  } catch (error) {
    console.error('Error listing rides:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = UpdateRideSchema.parse(req.body);
    const captainId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const updatedRide = await RideService.updateRideInfo(rideId, captainId, validatedData);
    
    if (!updatedRide) {
      res.status(404).json({ error: 'Ride not found or you are not the captain/co-captain' });
      return;
    }

    res.json({ message: 'Ride updated successfully', ride: updatedRide });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else if (error.message?.startsWith('Invalid status transition')) {
      res.status(400).json({ error: error.message });
    } else {
      console.error('Error updating ride:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const joinRide = async (req: Request, res: Response): Promise<void> => {
  try {
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const success = await RideService.joinRide(rideId, riderId);
    
    if (success) {
      res.json({ message: 'Successfully joined the ride' });
    } else {
      res.status(400).json({ message: 'You are already a participant of this ride' });
    }
  } catch (error: any) {
    if (error.message?.includes('maximum capacity')) {
      res.status(400).json({ error: error.message });
    } else if (error.message?.includes('Cannot join')) {
      res.status(400).json({ error: error.message });
    } else if (error.message === 'Ride not found') {
      res.status(404).json({ error: 'Ride not found' });
    } else {
      console.error('Error joining ride:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// ---- Co-Captain Promotion ----

export const promoteCoCaptain = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = PromoteCoCaptainSchema.parse(req.body);
    const captainId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const success = await RideService.promoteToCoCaptain(rideId, captainId, validated.rider_id);

    if (success) {
      res.json({ message: 'Rider promoted to co-captain successfully' });
    } else {
      res.status(400).json({ error: 'Could not promote rider. Either you are not the captain, or the target is not a confirmed participant.' });
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else {
      console.error('Error promoting co-captain:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// ---- Ride Stops ----

export const requestStop = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = RequestStopSchema.parse(req.body);
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;

    const stop = await RideService.requestStop(rideId, riderId, validated);

    if (stop) {
      res.status(201).json({ message: 'Stop request submitted', stop });
    } else {
      res.status(403).json({ error: 'You are not a confirmed participant of this ride' });
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else {
      console.error('Error requesting stop:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const handleStopRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = HandleStopSchema.parse(req.body);
    const captainId = (req.rider as unknown as RiderPayload).riderId;
    const rideId = req.params.id as string;
    const stopId = req.params.stopId as string;

    const success = await RideService.handleStopRequest(rideId, stopId, captainId, validated.status);

    if (success) {
      res.json({ message: `Stop request ${validated.status}` });
    } else {
      res.status(400).json({ error: 'Could not update stop. Either you are not a captain/co-captain, or the stop is not pending.' });
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
    } else {
      console.error('Error handling stop request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const getRideStops = async (req: Request, res: Response): Promise<void> => {
  try {
    const rideId = req.params.id as string;
    const stops = await RideService.listRideStops(rideId);
    res.json({ stops });
  } catch (error) {
    console.error('Error listing stops:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

import type { Request, Response } from 'express';
import { CreateRideSchema, UpdateRideSchema } from '../schemas/ride.schemas.js';
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
      res.status(404).json({ error: 'Ride not found or you are not the captain' });
      return;
    }

    res.json({ message: 'Ride updated successfully', ride: updatedRide });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
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

    const ride = await RideService.getRideById(rideId);
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }

    const success = await RideService.joinRide(rideId, riderId);
    
    if (success) {
      res.json({ message: 'Successfully joined the ride' });
    } else {
      res.status(400).json({ message: 'You are already a participant of this ride' });
    }
  } catch (error) {
    console.error('Error joining ride:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

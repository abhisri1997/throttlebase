import type { Request, Response } from 'express';
import { CreateRouteSchema, GpsTraceBatchSchema } from '../schemas/route.schemas.js';
import * as RouteService from '../services/route.service.js';

interface RiderPayload {
  riderId: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const createRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = CreateRouteSchema.parse(req.body);
    const riderId = (req.rider as unknown as RiderPayload).riderId;

    const newRoute = await RouteService.createRoute(riderId, validatedData);
    res.status(201).json(newRoute);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ errors: error.issues });
      return;
    }
    console.error('Error creating route:', error);
    res.status(500).json({ error: 'Internal server error while creating route' });
  }
};

export const getRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const viewerId = (req.rider as unknown as RiderPayload).riderId;
    const route = await RouteService.getRouteById(req.params.id as string, viewerId);

    if (!route) {
      res.status(404).json({ error: 'Route not found or access denied' });
      return;
    }

    res.json(route);
  } catch (error: any) {
    console.error('Error fetching route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listRoutes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const routes = await RouteService.listPublicRoutes();
    res.json(routes);
  } catch (error: any) {
    console.error('Error listing routes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export const bookmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const created = await RouteService.bookmarkRoute(req.params.id as string, riderId);

    if (created) {
      res.json({ message: 'Route bookmarked' });
    } else {
      res.json({ message: 'Already bookmarked' });
    }
  } catch (error: any) {
    console.error('Error bookmarking route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const unbookmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const removed = await RouteService.unbookmarkRoute(req.params.id as string, riderId);

    if (removed) {
      res.json({ message: 'Bookmark removed' });
    } else {
      res.status(404).json({ error: 'Bookmark not found' });
    }
  } catch (error: any) {
    console.error('Error unbookmarking route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

export const shareRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rider_id: sharedWithRiderId } = req.body;

    if (!sharedWithRiderId) {
      res.status(400).json({ error: 'rider_id is required' });
      return;
    }

    const shared = await RouteService.shareRouteWithRider(req.params.id as string, sharedWithRiderId);

    if (shared) {
      res.json({ message: 'Route shared successfully' });
    } else {
      res.json({ message: 'Already shared with this rider' });
    }
  } catch (error: any) {
    console.error('Error sharing route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ---------------------------------------------------------------------------
// GPS Traces
// ---------------------------------------------------------------------------

export const uploadGpsTraces = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = GpsTraceBatchSchema.parse(req.body);
    const riderId = (req.rider as unknown as RiderPayload).riderId;

    const count = await RouteService.ingestGpsTraces(riderId, validatedData);
    res.status(201).json({ message: `${count} GPS points recorded` });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ errors: error.issues });
      return;
    }
    console.error('Error uploading GPS traces:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getTraces = async (req: Request, res: Response): Promise<void> => {
  try {
    const riderId = (req.rider as unknown as RiderPayload).riderId;
    const traces = await RouteService.getRideGpsTraces(req.params.rideId as string, riderId);
    res.json(traces);
  } catch (error: any) {
    console.error('Error fetching GPS traces:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

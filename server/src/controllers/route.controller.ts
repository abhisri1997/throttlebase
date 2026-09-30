import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CreateRouteSchema,
  GpsTraceBatchSchema,
  RouteSearchQuerySchema,
  ShareRouteSchema,
  UpdateRouteVisibilitySchema,
} from '../schemas/route.schemas.js';
import * as RouteService from '../services/route.service.js';
import { GOOGLE_LOOKUPS } from '../services/route-place-lookups.js';
import { RouteTooShortError } from '../services/route-public-view.js';

interface RiderPayload {
  riderId: string;
}

const RouteIdSchema = z.string().uuid();

/** Someone else's route, or none: the same answer, so neither is revealed. */
const NOT_YOURS = { error: 'Route not found' };

const isZodError = (error: unknown): error is z.ZodError => error instanceof z.ZodError;

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

/** Routes from one place to another, nearby or by name, either direction. */
export const searchRoutes = async (req: Request, res: Response): Promise<void> => {
  try {
    const viewerId = (req.rider as unknown as RiderPayload).riderId;
    const q = RouteSearchQuerySchema.parse(req.query);
    const place = (lat: number | undefined, lng: number | undefined, name: string | undefined) =>
      lat !== undefined && lng !== undefined ? { lat, lng, name: name ?? null } : null;

    const results = await RouteService.searchRoutes(viewerId, {
      from: place(q.from_lat, q.from_lng, q.from_name),
      to: place(q.to_lat, q.to_lng, q.to_name),
      minKm: q.min_km ?? null,
      maxKm: q.max_km ?? null,
      highlights: q.highlights,
    });
    res.json(results);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      res.status(400).json({ error: 'Invalid search', details: error.issues });
      return;
    }
    console.error('Error searching routes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listRoutes = async (req: Request, res: Response): Promise<void> => {
  try {
    const viewerId = (req.rider as unknown as RiderPayload).riderId;
    const routes = await RouteService.listVisibleRoutes(viewerId);
    res.json(routes);
  } catch (error: any) {
    console.error('Error listing routes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ---------------------------------------------------------------------------
// The owner's control over their routes
// ---------------------------------------------------------------------------

export const deleteRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = (req.rider as unknown as RiderPayload).riderId;
    const routeId = RouteIdSchema.parse(req.params.id);

    if (!(await RouteService.deleteRoute(routeId, ownerId))) {
      res.status(404).json(NOT_YOURS);
      return;
    }
    res.json({ message: 'Route deleted' });
  } catch (error: unknown) {
    if (isZodError(error)) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('Error deleting route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateRouteVisibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = (req.rider as unknown as RiderPayload).riderId;
    const routeId = RouteIdSchema.parse(req.params.id);
    const { visibility } = UpdateRouteVisibilitySchema.parse(req.body ?? {});

    const route = await RouteService.setRouteVisibility(routeId, ownerId, visibility, GOOGLE_LOOKUPS);
    if (!route) {
      res.status(404).json(NOT_YOURS);
      return;
    }
    res.json({ route });
  } catch (error: unknown) {
    if (isZodError(error)) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    if (error instanceof RouteTooShortError) {
      res.status(422).json({ error: error.message, code: 'ROUTE_TOO_SHORT' });
      return;
    }
    console.error('Error changing route visibility:', error);
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

/** Only the owner shares their route: a share grants access to it. */
export const shareRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = (req.rider as unknown as RiderPayload).riderId;
    const routeId = RouteIdSchema.parse(req.params.id);
    const { rider_id: sharedWithRiderId } = ShareRouteSchema.parse(req.body ?? {});

    const outcome = await RouteService.shareRouteWithRider(routeId, ownerId, sharedWithRiderId);
    if (outcome === 'not_found') {
      res.status(404).json({ error: 'Route or rider not found' });
      return;
    }
    res.json({ message: outcome === 'shared' ? 'Route shared successfully' : 'Already shared with this rider' });
  } catch (error: unknown) {
    if (isZodError(error)) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
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

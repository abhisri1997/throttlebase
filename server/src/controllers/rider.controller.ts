import type { Request, Response } from 'express';
import { UpdateRiderSchema } from '../schemas/rider.schemas.js';
import * as RiderService from '../services/rider.service.js';

/**
 * RiderController — Handles HTTP request/response for rider profile endpoints.
 *
 * Learning Note:
 * All these handlers assume `req.rider` is populated by the authenticate
 * middleware. The `riderId` from the JWT is used to scope queries to the
 * logged-in user's own data.
 */

/**
 * GET /api/riders/me
 * Fetch the authenticated rider's full profile.
 */
export const getMyProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rider = await RiderService.getById(req.rider!.riderId);

    if (!rider) {
      res.status(404).json({ error: 'Rider not found' });
      return;
    }

    res.json({ rider });
  } catch (error: any) {
    console.error('Get profile error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/riders/:id
 * Fetch another rider's public profile.
 */
export const getPublicProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = req.params.id as string;

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
      res.status(400).json({ error: 'Invalid rider ID format' });
      return;
    }

    const rider = await RiderService.getById(id);

    if (!rider) {
      res.status(404).json({ error: 'Rider not found' });
      return;
    }

    // Return public profile (strip sensitive fields)
    const { email, phone_number, weight_kg, ...publicProfile } = rider;
    res.json({ rider: publicProfile });
  } catch (error: any) {
    console.error('Get public profile error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * PATCH /api/riders/me
 * Update the authenticated rider's profile.
 */
export const updateMyProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parseResult = UpdateRiderSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.issues,
      });
      return;
    }

    const updatedRider = await RiderService.update(
      req.rider!.riderId,
      parseResult.data
    );

    if (!updatedRider) {
      res.status(404).json({ error: 'Rider not found' });
      return;
    }

    res.json({
      message: 'Profile updated successfully',
      rider: updatedRider,
    });
  } catch (error: any) {
    console.error('Update profile error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * DELETE /api/riders/me
 * Soft-delete the authenticated rider's account.
 */
export const deleteMyAccount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const deleted = await RiderService.softDelete(req.rider!.riderId);

    if (!deleted) {
      res.status(404).json({ error: 'Rider not found' });
      return;
    }

    res.json({
      message: 'Account deleted. You have 30 days to recover it.',
    });
  } catch (error: any) {
    console.error('Delete account error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

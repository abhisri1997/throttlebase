import type { Request, Response } from 'express';
import { CreateBadgeSchema, CreateAchievementSchema } from '../schemas/rewards.schemas.js';
import * as RewardsService from '../services/rewards.service.js';

interface RiderPayload { riderId: string; email: string }
const rid = (req: Request) => (req.rider as unknown as RiderPayload).riderId;

// ── Badges ──────────────────────────────────────────────────────────────────

export const createBadge = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = CreateBadgeSchema.parse(req.body);
    const badge = await RewardsService.createBadge(data);
    res.status(201).json(badge);
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ errors: error.issues }); return; }
    console.error('Error creating badge:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listBadges = async (_req: Request, res: Response): Promise<void> => {
  try { res.json(await RewardsService.listBadges()); }
  catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const awardBadge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rider_id } = req.body;
    if (!rider_id) { res.status(400).json({ error: 'rider_id required' }); return; }
    const awarded = await RewardsService.awardBadge(rider_id, req.params.id as string);
    if (awarded) { res.status(201).json(awarded); }
    else { res.json({ message: 'Badge already awarded' }); }
  } catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const getMyBadges = async (req: Request, res: Response): Promise<void> => {
  try { res.json(await RewardsService.getRiderBadges(rid(req))); }
  catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const getRiderBadges = async (req: Request, res: Response): Promise<void> => {
  try { res.json(await RewardsService.getRiderBadges(req.params.id as string)); }
  catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

// ── Achievements ────────────────────────────────────────────────────────────

export const createAchievement = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = CreateAchievementSchema.parse(req.body);
    const ach = await RewardsService.createAchievement(data);
    res.status(201).json(ach);
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ errors: error.issues }); return; }
    console.error('Error creating achievement:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listAchievements = async (_req: Request, res: Response): Promise<void> => {
  try { res.json(await RewardsService.listAchievements()); }
  catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const getMyAchievements = async (req: Request, res: Response): Promise<void> => {
  try { res.json(await RewardsService.getRiderAchievements(rid(req))); }
  catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

// ── Leaderboard ─────────────────────────────────────────────────────────────

export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const metric = (req.query.metric as string) || 'total_distance_km';
    const allowed = ['total_distance_km', 'total_rides', 'badges_earned'] as const;
    if (!allowed.includes(metric as any)) {
      res.status(400).json({ error: `metric must be one of: ${allowed.join(', ')}` });
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(await RewardsService.getLeaderboard(metric as typeof allowed[number], limit));
  } catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

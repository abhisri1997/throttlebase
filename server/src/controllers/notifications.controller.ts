import type { Request, Response } from 'express';
import {
  UpdateSettingsSchema, UpdatePrivacySchema, UpdateNotificationPrefSchema,
} from '../schemas/notifications.schemas.js';
import * as NotifService from '../services/notifications.service.js';

interface RiderPayload { riderId: string; email: string }
const rid = (req: Request) => (req.rider as unknown as RiderPayload).riderId;

// ── Notifications ───────────────────────────────────────────────────────────

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const unreadOnly = req.query.unread === 'true';
    res.json(await NotifService.getNotifications(rid(req), unreadOnly));
  } catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const ok = await NotifService.markAsRead(req.params.id as string, rid(req));
    if (!ok) { res.status(404).json({ error: 'Notification not found' }); return; }
    res.json({ message: 'Marked as read' });
  } catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const count = await NotifService.markAllAsRead(rid(req));
    res.json({ message: `${count} notifications marked as read` });
  } catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

// ── Notification Preferences ────────────────────────────────────────────────

export const getPrefs = async (req: Request, res: Response): Promise<void> => {
  try { res.json(await NotifService.getNotificationPrefs(rid(req))); }
  catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const upsertPref = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = UpdateNotificationPrefSchema.parse(req.body);
    res.json(await NotifService.upsertNotificationPref(rid(req), data));
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ errors: error.issues }); return; }
    console.error(error); res.status(500).json({ error: 'Internal server error' });
  }
};

// ── Settings ────────────────────────────────────────────────────────────────

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try { res.json(await NotifService.getSettings(rid(req))); }
  catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = UpdateSettingsSchema.parse(req.body);
    res.json(await NotifService.updateSettings(rid(req), data));
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ errors: error.issues }); return; }
    console.error(error); res.status(500).json({ error: 'Internal server error' });
  }
};

// ── Privacy ─────────────────────────────────────────────────────────────────

export const getPrivacy = async (req: Request, res: Response): Promise<void> => {
  try { res.json(await NotifService.getPrivacy(rid(req))); }
  catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const updatePrivacy = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = UpdatePrivacySchema.parse(req.body);
    res.json(await NotifService.updatePrivacy(rid(req), data));
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ errors: error.issues }); return; }
    console.error(error); res.status(500).json({ error: 'Internal server error' });
  }
};

// ── Blocked Riders ──────────────────────────────────────────────────────────

export const block = async (req: Request, res: Response): Promise<void> => {
  try {
    const blocked = await NotifService.blockRider(rid(req), req.params.id as string);
    res.json({ message: blocked ? 'Rider blocked' : 'Already blocked' });
  } catch (error: any) {
    if (error.message === 'Cannot block yourself') { res.status(400).json({ error: error.message }); return; }
    console.error(error); res.status(500).json({ error: 'Internal server error' });
  }
};

export const unblock = async (req: Request, res: Response): Promise<void> => {
  try {
    const unblocked = await NotifService.unblockRider(rid(req), req.params.id as string);
    if (!unblocked) { res.status(404).json({ error: 'Not blocked' }); return; }
    res.json({ message: 'Rider unblocked' });
  } catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

export const getBlocked = async (req: Request, res: Response): Promise<void> => {
  try { res.json(await NotifService.getBlockedRiders(rid(req))); }
  catch (e: any) { console.error(e); res.status(500).json({ error: 'Internal server error' }); }
};

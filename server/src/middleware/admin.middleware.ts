import type { Request, Response, NextFunction } from "express";
import { query } from "../config/db.js";

/**
 * requireAdmin middleware
 *
 * Checks that the authenticated rider has is_admin = true.
 * Must be placed after `authenticate` in the middleware chain.
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const riderId = (req.rider as { riderId: string } | undefined)?.riderId;

  if (!riderId) {
    res.status(401).json({ error: "Access denied. No token provided." });
    return;
  }

  const result = await query(
    `SELECT is_admin FROM riders WHERE id = $1 AND deleted_at IS NULL`,
    [riderId],
  );

  if (!result.rows.length || !result.rows[0].is_admin) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  next();
};

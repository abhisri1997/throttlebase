import type { Request, Response, NextFunction } from "express";

/**
 * Restricts a route to admins.
 *
 * Roles come from the verified token rather than a fresh database read. They
 * are re-read from rider_roles on every token refresh, so a revoked admin
 * loses access within the access-token lifetime (15 minutes) without a query
 * on every request.
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.auth) {
    res.status(401).json({ error: "Access denied. No token provided." });
    return;
  }

  if (!req.auth.roles.includes("admin")) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  next();
};

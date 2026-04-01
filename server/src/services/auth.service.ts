import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { query } from "../config/db.js";
import { recordLoginActivity, createSession } from "./security.service.js";

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_dev_secret";
const JWT_EXPIRY_SECONDS = parseInt(process.env.JWT_EXPIRY_SECONDS || "86400"); // 24h in seconds

/**
 * AuthService — Core authentication business logic.
 *
 * Learning Notes:
 * - bcrypt.hash() generates a unique salt each time, so even identical
 *   passwords produce different hashes. This protects against rainbow tables.
 * - bcrypt.compare() extracts the salt from the stored hash to verify.
 * - JWT (JSON Web Token) encodes a payload + signature. The server never
 *   stores the token — it verifies the signature on each request.
 */

export interface RiderPublic {
  id: string;
  email: string;
  display_name: string;
  username: string | null;
  experience_level: string;
  created_at: string;
}

/**
 * Register a new rider.
 * 1. Hash password with bcrypt (12 salt rounds)
 * 2. Insert into riders table
 * 3. Return the new rider (without password_hash)
 */
export const register = async (
  email: string,
  password: string,
  displayName: string,
  username: string,
): Promise<RiderPublic> => {
  // Hash the plain-text password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO riders (email, password_hash, display_name, username)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, display_name, username, experience_level, created_at`,
    [email, passwordHash, displayName, username],
  );

  return result.rows[0] as RiderPublic;
};

/**
 * Login an existing rider.
 * 1. Find rider by email
 * 2. Compare password against stored hash
 * 3. Generate and return a JWT
 */
export const login = async (
  identifier: string,
  password: string,
  meta?: { ipAddress?: string; deviceInfo?: string },
): Promise<{ token: string; rider: RiderPublic }> => {
  // Find the rider by either email or username (case-insensitive)
  const result = await query(
    `SELECT id, email, username, password_hash, display_name, experience_level, created_at
     FROM riders
     WHERE (lower(email) = lower($1) OR lower(username) = lower($1))
       AND deleted_at IS NULL`,
    [identifier],
  );

  if (result.rows.length === 0) {
    throw new Error("Invalid email or password");
  }

  const rider = result.rows[0] as RiderPublic & { password_hash: string };

  // Verify password against the stored bcrypt hash
  const isMatch = await bcrypt.compare(password, rider.password_hash);
  if (!isMatch) {
    throw new Error("Invalid email or password");
  }

  // Generate JWT with rider info as payload
  const token = jwt.sign(
    { riderId: rider.id, email: rider.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY_SECONDS },
  );

  // Return token + rider data (strip password_hash)
  const { password_hash: _, ...riderPublic } = rider;

  // Record login activity and create a tracked session (fire-and-forget, non-blocking)
  void (async () => {
    try {
      const activityInput: Parameters<typeof recordLoginActivity>[0] = { riderId: rider.id };
      if (meta?.ipAddress) activityInput.ipAddress = meta.ipAddress;
      if (meta?.deviceInfo) activityInput.deviceFingerprint = meta.deviceInfo;
      await recordLoginActivity(activityInput);

      const sessionInput: Parameters<typeof createSession>[0] = {
        riderId: rider.id,
        sessionToken: randomUUID(),
      };
      if (meta?.deviceInfo) sessionInput.deviceInfo = meta.deviceInfo;
      if (meta?.ipAddress) sessionInput.ipAddress = meta.ipAddress;
      await createSession(sessionInput);
    } catch (err) {
      console.error("[auth] Failed to record login activity/session:", err);
    }
  })();
  return { token, rider: riderPublic };
};

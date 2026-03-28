import type { Request, Response } from "express";
import { RegisterSchema, LoginSchema } from "../schemas/auth.schemas.js";
import * as AuthService from "../services/auth.service.js";
import { query } from "../config/db.js";

/**
 * AuthController — Handles HTTP request/response for auth endpoints.
 *
 * Learning Note:
 * Controllers should be THIN. They only:
 * 1. Validate incoming data (using Zod)
 * 2. Call the service layer
 * 3. Format the HTTP response
 * No business logic lives here — that's the service's job.
 */

/**
 * POST /auth/register
 * Creates a new rider account.
 */
export const handleRegister = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Validate request body against Zod schema
    const parseResult = RegisterSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parseResult.error.issues,
      });
      return;
    }

    const { email, password, display_name, username } = parseResult.data;

    // Call the service to register the rider
    const rider = await AuthService.register(
      email,
      password,
      display_name,
      username,
    );

    res.status(201).json({
      message: "Rider registered successfully",
      rider,
    });
  } catch (error: any) {
    // Handle duplicate email (PostgreSQL unique violation code: 23505)
    if (error.code === "23505") {
      if (error.constraint === "riders_username_key") {
        res.status(409).json({ error: "Username already taken" });
      } else {
        res.status(409).json({ error: "Email already registered" });
      }
      return;
    }
    console.error("Registration error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /auth/login
 * Authenticates a rider and returns a JWT.
 */
export const handleLogin = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Validate request body against Zod schema
    const parseResult = LoginSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parseResult.error.issues,
      });
      return;
    }

    const { identifier, password } = parseResult.data;

    // Call the service to login
    const result = await AuthService.login(identifier, password);

    res.status(200).json({
      message: "Login successful",
      token: result.token,
      rider: result.rider,
    });
  } catch (error: any) {
    // Don't leak specific info about which field was wrong
    if (error.message === "Invalid email or password") {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /auth/check-username?username=xyz
 * Returns { available: boolean } — no auth required.
 */
export const handleCheckUsername = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const username = String(req.query.username ?? "").trim();

  if (
    !username ||
    username.length < 3 ||
    username.length > 50 ||
    !/^[a-zA-Z0-9_]+$/.test(username)
  ) {
    res.status(400).json({ error: "Invalid username format" });
    return;
  }

  const result = await query(
    "SELECT 1 FROM riders WHERE lower(username) = lower($1) AND deleted_at IS NULL LIMIT 1",
    [username],
  );

  res.json({ available: result.rows.length === 0 });
};

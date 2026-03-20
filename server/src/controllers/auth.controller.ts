import type { Request, Response } from 'express';
import { RegisterSchema, LoginSchema } from '../schemas/auth.schemas.js';
import * as AuthService from '../services/auth.service.js';

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
  res: Response
): Promise<void> => {
  try {
    // Validate request body against Zod schema
    const parseResult = RegisterSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.issues,
      });
      return;
    }

    const { email, password, display_name } = parseResult.data;

    // Call the service to register the rider
    const rider = await AuthService.register(email, password, display_name);

    res.status(201).json({
      message: 'Rider registered successfully',
      rider,
    });
  } catch (error: any) {
    // Handle duplicate email (PostgreSQL unique violation code: 23505)
    if (error.code === '23505') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }
    console.error('Registration error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /auth/login
 * Authenticates a rider and returns a JWT.
 */
export const handleLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Validate request body against Zod schema
    const parseResult = LoginSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.issues,
      });
      return;
    }

    const { email, password } = parseResult.data;

    // Call the service to login
    const result = await AuthService.login(email, password);

    res.status(200).json({
      message: 'Login successful',
      token: result.token,
      rider: result.rider,
    });
  } catch (error: any) {
    // Don't leak specific info about which field was wrong
    if (error.message === 'Invalid email or password') {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

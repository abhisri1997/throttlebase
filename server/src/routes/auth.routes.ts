import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller.js';

/**
 * Auth Routes
 *
 * POST /auth/register  →  Create a new rider
 * POST /auth/login     →  Authenticate and get JWT
 *
 * Learning Note:
 * Express Router lets us group related routes into modules.
 * This keeps app.ts clean and each feature self-contained.
 */

const router = Router();

router.post('/register', AuthController.handleRegister);
router.post('/login', AuthController.handleLogin);

export default router;

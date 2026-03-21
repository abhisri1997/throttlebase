import { Router } from 'express';
import * as AuthController from '../controllers/auth.controller.js';

/**
 * Auth Routes
 *
 * POST /auth/register  →  Create a new rider
 * POST /auth/login     →  Authenticate and get JWT
 */

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new rider
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, display_name]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: rider@example.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: mypassword123
 *               display_name:
 *                 type: string
 *                 example: SpeedDemon
 *     responses:
 *       201:
 *         description: Registration successful, returns JWT token
 *       400:
 *         description: Validation error or email already exists
 */
router.post('/register', AuthController.handleRegister);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in and receive a JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: rider@example.com
 *               password:
 *                 type: string
 *                 example: mypassword123
 *     responses:
 *       200:
 *         description: Login successful, returns JWT token
 *       401:
 *         description: Invalid email or password
 */
router.post('/login', AuthController.handleLogin);

export default router;

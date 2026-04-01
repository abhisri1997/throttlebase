import { Router } from "express";
import * as AuthController from "../controllers/auth.controller.js";
import * as SecurityController from "../controllers/security.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

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
router.post("/register", AuthController.handleRegister);
router.get("/check-username", AuthController.handleCheckUsername);

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
 *             required: [identifier, password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 example: rider@example.com or roadwarrior
 *               password:
 *                 type: string
 *                 example: mypassword123
 *     responses:
 *       200:
 *         description: Login successful, returns JWT token
 *       401:
 *         description: Invalid email or password
 */
router.post("/login", AuthController.handleLogin);

// ── 2FA / TOTP (auth required) ───────────────────────────────────────────────

/**
 * @swagger
 * /auth/2fa/status:
 *   get:
 *     summary: Get 2FA enablement status
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status object
 */
router.get("/2fa/status", authenticate, SecurityController.handleTotpStatus);

/**
 * @swagger
 * /auth/2fa/setup:
 *   post:
 *     summary: Initiate TOTP setup — returns secret + otpauth URL
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: TOTP setup info
 */
router.post("/2fa/setup", authenticate, SecurityController.handleTotpSetup);

/**
 * @swagger
 * /auth/2fa/verify:
 *   post:
 *     summary: Verify TOTP token and enable 2FA
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: 2FA enabled
 *       400:
 *         description: Invalid token or setup not initiated
 */
router.post("/2fa/verify", authenticate, SecurityController.handleTotpVerify);

/**
 * @swagger
 * /auth/2fa/disable:
 *   post:
 *     summary: Disable 2FA (requires password + TOTP confirmation)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password, token]
 *             properties:
 *               password:
 *                 type: string
 *               token:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: 2FA disabled
 *       401:
 *         description: Invalid password or token
 */
router.post("/2fa/disable", authenticate, SecurityController.handleTotpDisable);

export default router;

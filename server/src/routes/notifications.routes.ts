import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as nc from '../controllers/notifications.controller.js';

const router = Router();
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get your notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "false"
 *     responses:
 *       200:
 *         description: Array of notifications
 */
router.get('/', nc.getNotifications);

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Count of notifications marked as read
 */
router.patch('/read-all', nc.markAllAsRead);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Not found
 */
router.patch('/:id/read', nc.markAsRead);

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/notifications/preferences:
 *   get:
 *     summary: Get your notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of notification type preferences
 *   put:
 *     summary: Set preference for a notification type
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [notification_type]
 *             properties:
 *               notification_type:
 *                 type: string
 *                 example: ride_invitation
 *               push_enabled:
 *                 type: boolean
 *               in_app_enabled:
 *                 type: boolean
 *               email_enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preference saved
 */
router.get('/preferences', nc.getPrefs);
router.put('/preferences', nc.upsertPref);

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/notifications/settings:
 *   get:
 *     summary: Get your app settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings (theme, language, units)
 *   patch:
 *     summary: Update your app settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: [dark, light]
 *               language:
 *                 type: string
 *                 example: en
 *               distance_unit:
 *                 type: string
 *                 enum: [km, mi]
 *               speed_unit:
 *                 type: string
 *                 enum: [kmh, mph]
 *     responses:
 *       200:
 *         description: Updated settings
 */
router.get('/settings', nc.getSettings);
router.patch('/settings', nc.updateSettings);

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVACY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/notifications/privacy:
 *   get:
 *     summary: Get your privacy settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Privacy settings
 *   patch:
 *     summary: Update your privacy settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profile_visibility:
 *                 type: string
 *                 enum: [public, riders_only, private]
 *               ride_history_visibility:
 *                 type: string
 *                 enum: [public, riders_only, private]
 *               leaderboard_opt_in:
 *                 type: boolean
 *               invite_permission:
 *                 type: string
 *                 enum: [everyone, followers_only, no_one]
 *     responses:
 *       200:
 *         description: Updated privacy settings
 */
router.get('/privacy', nc.getPrivacy);
router.patch('/privacy', nc.updatePrivacy);

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKED RIDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/notifications/blocked:
 *   get:
 *     summary: Get your blocked riders list
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of blocked riders
 */
router.get('/blocked', nc.getBlocked);

/**
 * @swagger
 * /api/notifications/blocked/{id}:
 *   post:
 *     summary: Block a rider
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Rider blocked
 *       400:
 *         description: Cannot block yourself
 *   delete:
 *     summary: Unblock a rider
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Rider unblocked
 *       404:
 *         description: Not blocked
 */
router.post('/blocked/:id', nc.block);
router.delete('/blocked/:id', nc.unblock);

export default router;

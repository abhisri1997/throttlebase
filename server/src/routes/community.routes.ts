import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as cc from '../controllers/community.controller.js';

const router = Router();
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════════════
// POSTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/community/posts:
 *   get:
 *     summary: Get community feed (paginated)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Array of posts with author info
 *   post:
 *     summary: Create a new post
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 example: Just finished an epic 200km ride!
 *               media_urls:
 *                 type: array
 *                 items:
 *                   type: string
 *               shared_route_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Post created
 */
router.get('/posts', cc.getFeed);
router.post('/posts', cc.createPost);

/**
 * @swagger
 * /api/community/posts/{id}:
 *   get:
 *     summary: Get a single post
 *     tags: [Community]
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
 *         description: Post details
 *       404:
 *         description: Post not found
 *   delete:
 *     summary: Delete your own post
 *     tags: [Community]
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
 *         description: Post deleted
 *       404:
 *         description: Post not found or not yours
 */
router.get('/posts/:id', cc.getPost);
router.patch('/posts/:id', cc.updatePost);
router.delete('/posts/:id', cc.deletePost);

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/community/posts/{id}/comments:
 *   get:
 *     summary: Get comments on a post
 *     tags: [Community]
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
 *         description: Array of comments
 *   post:
 *     summary: Add a comment to a post
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 example: Great ride! Wish I was there.
 *               mentions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       201:
 *         description: Comment added
 */
router.get('/posts/:id/comments', cc.getComments);
router.post('/posts/:id/comments', cc.addComment);
router.patch('/comments/:id', cc.updateComment);
router.delete('/comments/:id', cc.deleteComment);

// ═══════════════════════════════════════════════════════════════════════════════
// LIKES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/community/posts/{id}/like:
 *   post:
 *     summary: Like a post
 *     tags: [Community]
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
 *         description: Post liked (or already liked)
 *   delete:
 *     summary: Unlike a post
 *     tags: [Community]
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
 *         description: Like removed
 *       404:
 *         description: Like not found
 */
router.post('/posts/:id/like', cc.likePost);
router.delete('/posts/:id/like', cc.unlikePost);

// ═══════════════════════════════════════════════════════════════════════════════
// FOLLOWS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/community/riders/{id}/follow:
 *   post:
 *     summary: Follow a rider
 *     tags: [Community]
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
 *         description: Now following
 *       400:
 *         description: Cannot follow yourself
 *   delete:
 *     summary: Unfollow a rider
 *     tags: [Community]
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
 *         description: Unfollowed
 *       404:
 *         description: Not following this rider
 */
router.post('/riders/:id/follow', cc.follow);
router.delete('/riders/:id/follow', cc.unfollow);

/**
 * @swagger
 * /api/community/riders/{id}/followers:
 *   get:
 *     summary: Get a rider's followers
 *     tags: [Community]
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
 *         description: Array of followers
 */
router.get('/riders/:id/followers', cc.getFollowers);

/**
 * @swagger
 * /api/community/riders/{id}/following:
 *   get:
 *     summary: Get riders that a rider follows
 *     tags: [Community]
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
 *         description: Array of followed riders
 */
router.get('/riders/:id/following', cc.getFollowing);

// ═══════════════════════════════════════════════════════════════════════════════
// GROUPS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/community/groups:
 *   get:
 *     summary: List public groups
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of groups with member counts
 *   post:
 *     summary: Create a group (you become admin)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Weekend Warriors
 *               description:
 *                 type: string
 *                 example: Group for weekend riding enthusiasts
 *               visibility:
 *                 type: string
 *                 enum: [public, private]
 *                 default: public
 *     responses:
 *       201:
 *         description: Group created
 */
router.get('/groups', cc.listGroups);
router.post('/groups', cc.createGroup);

/**
 * @swagger
 * /api/community/groups/{id}/join:
 *   post:
 *     summary: Join a group
 *     tags: [Community]
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
 *         description: Joined group
 */
router.post('/groups/:id/join', cc.joinGroup);

/**
 * @swagger
 * /api/community/groups/{id}/leave:
 *   delete:
 *     summary: Leave a group (admins cannot leave)
 *     tags: [Community]
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
 *         description: Left group
 *       400:
 *         description: Cannot leave (admin or not a member)
 */
router.delete('/groups/:id/leave', cc.leaveGroup);

// ═══════════════════════════════════════════════════════════════════════════════
// RIDE REVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/community/rides/{rideId}/reviews:
 *   get:
 *     summary: Get reviews for a ride
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of reviews with reviewer names
 *   post:
 *     summary: Add a ride review (1-5 stars)
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               review_text:
 *                 type: string
 *                 example: Amazing ride, great captain!
 *     responses:
 *       201:
 *         description: Review added
 *       400:
 *         description: Validation error or already reviewed
 */
router.get('/rides/:rideId/reviews', cc.getReviews);
router.post('/rides/:rideId/reviews', cc.addReview);

export default router;

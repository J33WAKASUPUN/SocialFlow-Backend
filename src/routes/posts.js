const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { requireAuth } = require('../middlewares/auth');
const { uploadMedia } = require('../middlewares/upload');

router.use(requireAuth);

/**
 * @swagger
 * tags:
 *   name: Posts
 *   description: Post management and scheduling
 */

/**
 * @swagger
 * /api/v1/posts:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - brandId
 *               - content
 *             properties:
 *               brandId:
 *                 type: string
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               mediaUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *               schedules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     channelId:
 *                       type: string
 *                     scheduledFor:
 *                       type: string
 *                       format: date-time
 *     responses:
 *       201:
 *         description: Post created successfully
 */
router.post('/', postController.createPost);

/**
 * @swagger
 * /api/v1/posts:
 *   get:
 *     summary: Get brand posts
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: brandId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, scheduled, published, failed]
 *     responses:
 *       200:
 *         description: List of posts
 */
router.get('/', postController.getPosts);

router.get('/calendar', postController.getCalendar);
router.get('/:id', postController.getPostById);
router.patch('/:id', postController.updatePost);
router.delete('/:id', postController.deletePost);
router.post('/:id/schedule', postController.schedulePost);
router.delete('/:postId/schedules/:scheduleId', postController.cancelSchedule);

module.exports = router;
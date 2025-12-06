const express = require('express');
const router = express.Router();
const channelController = require('../controllers/channelController');
const { requireAuth } = require('../middlewares/auth');
const { validateObjectId, sanitizeQuery } = require('../middlewares/validateInput');
const { uploadMedia } = require('../middlewares/upload');
const { validateRequest, schemas } = require('../middlewares/validateRequest');
const s3Service = require('../services/s3Service');

/**
 * @swagger
 * tags:
 *   name: Channels
 *   description: Social media channel management and OAuth
 */

/**
 * @swagger
 * /api/v1/channels/oauth/{provider}:
 *   get:
 *     summary: Get OAuth authorization URL
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [facebook, linkedin, twitter, instagram, youtube]
 *       - in: query
 *         name: brandId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: returnUrl
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OAuth URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     authUrl:
 *                       type: string
 *                     state:
 *                       type: string
 */
router.get(
  '/oauth/:provider',
  requireAuth,
  channelController.getAuthorizationUrl
);

/**
 * @swagger
 * /api/v1/channels:
 *   get:
 *     summary: Get all brand channels
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: brandId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of channels
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Channel'
 */
router.get('/', requireAuth, channelController.getBrandChannels);

// OAuth Callback (public - no auth middleware, state validation in service)
router.get(
  '/oauth/:provider/callback',
  channelController.handleCallback
);

// Channel Management (all require authentication)
router.use(requireAuth);
router.use(sanitizeQuery); // anitize query params

// STATIC ROUTES FIRST (before :id routes)
router.get('/posts', channelController.getPosts); // Get all posts from DB

// DYNAMIC ROUTES
router.get('/', channelController.getBrandChannels);
router.get('/disconnected', channelController.getDisconnectedChannels);

// Validate :id parameter for all channel-specific routes
router.get('/:id', validateObjectId('id'), channelController.testConnection);
router.delete('/:id', validateObjectId('id'), channelController.disconnectChannel);
router.post('/:id/refresh', validateObjectId('id'), channelController.refreshToken);
router.post('/:id/test-publish', validateObjectId('id'), uploadMedia, channelController.testPublish);
router.patch('/:id/test-update', validateObjectId('id'), channelController.testUpdate);
router.delete('/:id/test-delete', validateObjectId('id'), channelController.testDelete);
router.post('/:id/test-publish-local', validateObjectId('id'), uploadMedia, channelController.testPublishLocal);
router.delete('/:id/permanent', validateObjectId('id'), channelController.permanentlyDeleteChannel);
router.get('/:id/delete-impact', validateObjectId('id'), channelController.getDeleteImpact);
router.get('/:id/posts', validateObjectId('id'), channelController.getPosts);

// Test endpoint
router.get('/test-s3', requireAuth, async (req, res, next) => {
  try {
    const isConnected = await s3Service.testConnection();
    res.json({
      success: isConnected,
      message: isConnected ? 'S3 connection successful' : 'S3 connection failed',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
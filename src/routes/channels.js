const express = require('express');
const router = express.Router();
const channelController = require('../controllers/channelController');
const { requireAuth } = require('../middlewares/auth');
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

// STATIC ROUTES FIRST (before :id routes)
router.get('/posts', channelController.getPosts); // Get all posts from DB

// DYNAMIC ROUTES
router.get('/', channelController.getBrandChannels);
router.get('/:id/test', channelController.testConnection);

// TWO-TIER DELETE ROUTES
router.delete('/:id', channelController.disconnectChannel);              // Soft delete
router.delete('/:id/permanent', channelController.permanentlyDeleteChannel); // Permanent delete
router.get('/:id/delete-impact', channelController.getDeleteImpact);

router.post('/:id/refresh', channelController.refreshToken);
router.get('/disconnected', channelController.getDisconnectedChannels);

// Publishing endpoints
router.post('/:id/test-publish', uploadMedia, channelController.testPublish);
router.patch('/:id/test-update', channelController.testUpdate);
router.delete('/:id/test-delete', channelController.testDelete);

router.post(
  '/:id/test-publish-local', 
  requireAuth, 
  uploadMedia,
  channelController.testPublishLocal
);

router.post('/test-upload-debug', uploadMedia, (req, res) => {
  console.log('📊 DEBUG - Files received:', req.files);
  console.log('📊 DEBUG - Body:', req.body);
  
  res.json({
    success: true,
    filesReceived: req.files?.length || 0,
    files: req.files,
    body: req.body,
  });
});

// ADD TEST ENDPOINT FOR AWS UPLAOD
router.get('/test-s3', requireAuth, async (req, res, next) => {
  try {
    const isConnected = await s3Service.testConnection();
    
    res.json({
      success: isConnected,
      message: isConnected ? 'S3 connection successful' : 'S3 connection failed',
      config: {
        region: process.env.AWS_REGION,
        bucket: process.env.AWS_S3_BUCKET_NAME,
      },
    });
  } catch (error) {
    next(error);
  }
});

// DEBUG ROUTE (with improved error handling)
router.get('/debug/instagram-pages', requireAuth, async (req, res, next) => {
  try {
    const { accessToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: 'accessToken query parameter required',
        example: 'GET /api/v1/channels/debug/instagram-pages?accessToken=YOUR_TOKEN'
      });
    }

    // LOG the access token (first 20 chars only for security)
    console.log('🔑 Testing Access Token:', accessToken.substring(0, 20) + '...');

    const axios = require('axios');
    const apiUrl = 'https://graph.facebook.com/v21.0';

    try {
      // Test 1: Get user info
      console.log('📊 Test 1: Getting user info...');
      const userResponse = await axios.get(`${apiUrl}/me`, {
        params: {
          fields: 'id,name,email',
          access_token: accessToken
        }
      });
      console.log('✅ User info retrieved:', userResponse.data);

      // Test 2: Get user's pages
      console.log('📊 Test 2: Getting user pages...');
      const pagesResponse = await axios.get(`${apiUrl}/me/accounts`, {
        params: {
          fields: 'id,name,access_token,instagram_business_account,category,tasks',
          access_token: accessToken
        }
      });
      console.log('✅ Pages retrieved:', pagesResponse.data);

      // Test 3: Get permissions
      console.log('📊 Test 3: Getting permissions...');
      const permissionsResponse = await axios.get(`${apiUrl}/me/permissions`, {
        params: {
          access_token: accessToken
        }
      });
      console.log('✅ Permissions retrieved:', permissionsResponse.data);

      res.json({
        success: true,
        data: {
          user: userResponse.data,
          pages: pagesResponse.data,
          permissions: permissionsResponse.data,
          analysis: {
            hasPages: !!(pagesResponse.data.data && pagesResponse.data.data.length > 0),
            pageCount: pagesResponse.data.data?.length || 0,
            pagesWithInstagram: pagesResponse.data.data?.filter(p => p.instagram_business_account).length || 0,
            grantedPermissions: permissionsResponse.data.data?.filter(p => p.status === 'granted').map(p => p.permission) || []
          }
        }
      });
    } catch (apiError) {
      // DETAILED API ERROR LOGGING
      console.error('❌ Facebook API Error:', {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        error: apiError.response?.data?.error,
        message: apiError.message
      });

      return res.status(apiError.response?.status || 500).json({
        success: false,
        message: 'Facebook API Error',
        error: {
          code: apiError.response?.data?.error?.code,
          message: apiError.response?.data?.error?.message,
          type: apiError.response?.data?.error?.type,
          fbtrace_id: apiError.response?.data?.error?.fbtrace_id
        },
        hint: apiError.response?.status === 400 
          ? 'Access token is invalid or expired. Generate a new token from Facebook Graph API Explorer.'
          : 'Check Facebook API error details above.'
      });
    }
  } catch (error) {
    console.error('❌ Debug Endpoint Error:', error);
    next(error);
  }
});

router.post(
  '/:id/test-publish', 
  uploadMedia, 
  validateRequest(schemas.publishPost),
  channelController.testPublish
);

router.patch(
  '/:id/test-update',
  validateRequest(schemas.updatePost),
  channelController.testUpdate
);

module.exports = router;
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

/**
 * @swagger
 * /api/v1/analytics/dashboard:
 *   get:
 *     summary: Get dashboard analytics
 *     tags: [Analytics]
 *     parameters:
 *       - name: brandId
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: period
 *         in: query
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, all]
 *           default: 30d
 *     responses:
 *       200:
 *         description: Dashboard metrics
 */
router.get('/dashboard', analyticsController.getDashboard);

/**
 * @swagger
 * /api/v1/analytics/channels:
 *   get:
 *     summary: Get channel performance
 *     tags: [Analytics]
 */
router.get('/channels', analyticsController.getChannelPerformance);

/**
 * @swagger
 * /api/v1/analytics/trends:
 *   get:
 *     summary: Get posting trends over time
 *     tags: [Analytics]
 */
router.get('/trends', analyticsController.getPostingTrends);

/**
 * @swagger
 * /api/v1/analytics/export/csv:
 *   get:
 *     summary: Export analytics as CSV
 *     tags: [Analytics]
 */
router.get('/export/csv', analyticsController.exportCSV);

module.exports = router;
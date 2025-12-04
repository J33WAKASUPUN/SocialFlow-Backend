const analyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

class AnalyticsController {
  /**
   * GET /api/v1/analytics/dashboard
   * Get dashboard metrics
   */
  async getDashboard(req, res, next) {
    try {
      const { brandId, period = '30d' } = req.query;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: 'Brand ID is required',
        });
      }

      // Pass userId for permission check
      const metrics = await analyticsService.getDashboardMetrics(
        brandId, 
        period,
        req.user._id // Pass current user ID
      );

      res.json({
        success: true,
        data: metrics,
        meta: {
          note: 'Metrics calculated from published posts in database',
          dataSource: 'internal_db',
          limitations: 'Social media engagement metrics (likes, shares) not available via free APIs',
        },
      });
    } catch (error) {
      if (error.message === 'Permission denied') {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this brand\'s analytics',
        });
      }
      logger.error('Dashboard analytics failed', error);
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/channels
   * Get channel performance
   */
  async getChannelPerformance(req, res, next) {
    try {
      const { brandId } = req.query;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: 'Brand ID is required',
        });
      }

      const performance = await analyticsService.getChannelPerformance(brandId);

      res.json({
        success: true,
        data: performance,
      });
    } catch (error) {
      logger.error('Channel performance failed', error);
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/trends
   * Get posting trends
   */
  async getPostingTrends(req, res, next) {
    try {
      const { brandId, period = '30d' } = req.query;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: 'Brand ID is required',
        });
      }

      const trends = await analyticsService.getPostingTrends(brandId, period);

      res.json({
        success: true,
        data: trends,
      });
    } catch (error) {
      logger.error('Posting trends failed', error);
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/export/csv
   * Export analytics as CSV
   */
  async exportCSV(req, res, next) {
    try {
      const { brandId, period = '30d' } = req.query;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: 'Brand ID is required',
        });
      }

      const csv = await analyticsService.exportToCSV(brandId, period);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${brandId}-${period}.csv`);
      res.send(csv);
    } catch (error) {
      logger.error('CSV export failed', error);
      next(error);
    }
  }
}

module.exports = new AnalyticsController();
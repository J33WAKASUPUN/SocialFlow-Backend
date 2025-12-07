const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

class NotificationController {
  /**
   * GET /api/v1/notifications
   * Get user notifications
   */
  async getNotifications(req, res, next) {
    try {
      const filters = {
        read: req.query.read === 'true' ? true : req.query.read === 'false' ? false : undefined,
        type: req.query.type,
        brandId: req.query.brandId,
        priority: req.query.priority,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
      };

      const result = await notificationService.getUserNotifications(
        req.user._id,
        filters
      );

      res.json({
        success: true,
        data: result.notifications,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error('❌ Get notifications failed', { error: error.message });
      next(error);
    }
  }

  /**
   * GET /api/v1/notifications/unread-count
   * Get unread count
   */
  async getUnreadCount(req, res, next) {
    try {
      const count = await notificationService.getUnreadCount(req.user._id);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      logger.error('❌ Get unread count failed', { error: error.message });
      next(error);
    }
  }

  /**
   * PATCH /api/v1/notifications/:id/read
   * Mark notification as read
   */
  async markAsRead(req, res, next) {
    try {
      const notification = await notificationService.markAsRead(
        req.params.id,
        req.user._id
      );

      res.json({
        success: true,
        message: 'Notification marked as read',
        data: notification,
      });
    } catch (error) {
      logger.error('❌ Mark as read failed', { error: error.message });
      next(error);
    }
  }

  /**
   * PATCH /api/v1/notifications/read-all
   * Mark all notifications as read
   */
  async markAllAsRead(req, res, next) {
    try {
      const result = await notificationService.markAllAsRead(req.user._id);

      res.json({
        success: true,
        message: 'All notifications marked as read',
        data: { count: result.modifiedCount },
      });
    } catch (error) {
      logger.error('❌ Mark all as read failed', { error: error.message });
      next(error);
    }
  }

  /**
   * DELETE /api/v1/notifications/:id
   * Delete notification
   */
  async deleteNotification(req, res, next) {
    try {
      await notificationService.deleteNotification(req.params.id, req.user._id);

      res.json({
        success: true,
        message: 'Notification deleted',
      });
    } catch (error) {
      logger.error('❌ Delete notification failed', { error: error.message });
      next(error);
    }
  }

  // ✅ ADD TEST ENDPOINT
  /**
   * POST /api/v1/notifications/test
   * Create a test notification
   */
  async createTestNotification(req, res, next) {
    try {
      const notification = await notificationService.createNotification({
        userId: req.user._id,
        brandId: req.body.brandId,
        type: 'post_published',
        title: '🧪 Test Notification',
        message: 'This is a test notification created manually for testing purposes.',
        data: {
          testData: 'Sample data',
        },
        actionUrl: '/dashboard',
        actionText: 'Go to Dashboard',
        priority: 'medium',
      });

      res.status(201).json({
        success: true,
        message: 'Test notification created',
        data: notification,
      });
    } catch (error) {
      logger.error('❌ Create test notification failed', { error: error.message });
      next(error);
    }
  }
}

module.exports = new NotificationController();
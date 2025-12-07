const Notification = require('../models/Notification');
const emailService = require('./emailService');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Create in-app notification
   */
  async createNotification(data) {
    try {
      const notification = await Notification.create({
        user: data.userId,
        brand: data.brandId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data || {},
        actionUrl: data.actionUrl,
        actionText: data.actionText,
        priority: data.priority || 'medium',
        expiresAt: data.expiresAt,
      });

      logger.info('✅ Notification created', {
        notificationId: notification._id,
        userId: data.userId,
        type: data.type,
      });

      return notification;
    } catch (error) {
      logger.error('❌ Create notification failed', {
        error: error.message,
        data,
      });
      throw error;
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, filters = {}) {
    try {
      const {
        read,
        type,
        brandId,
        priority,
        page = 1,
        limit = 20,
      } = filters;

      const query = { user: userId };

      if (read !== undefined) query.read = read;
      if (type) query.type = type;
      if (brandId) query.brand = brandId;
      if (priority) query.priority = priority;

      const skip = (page - 1) * limit;

      const [notifications, totalCount] = await Promise.all([
        Notification.find(query)
          .populate('brand', 'name logo')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments(query),
      ]);

      return {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
        },
      };
    } catch (error) {
      logger.error('❌ Get notifications failed', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId) {
    try {
      return await Notification.getUnreadCount(userId);
    } catch (error) {
      logger.error('❌ Get unread count failed', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOne({
        _id: notificationId,
        user: userId,
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      await notification.markAsRead();

      logger.info('✅ Notification marked as read', {
        notificationId,
        userId,
      });

      return notification;
    } catch (error) {
      logger.error('❌ Mark as read failed', {
        error: error.message,
        notificationId,
      });
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId) {
    try {
      const result = await Notification.markAllAsRead(userId);

      logger.info('✅ All notifications marked as read', {
        userId,
        count: result.modifiedCount,
      });

      return result;
    } catch (error) {
      logger.error('❌ Mark all as read failed', {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        user: userId,
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      logger.info('✅ Notification deleted', {
        notificationId,
        userId,
      });

      return { success: true };
    } catch (error) {
      logger.error('❌ Delete notification failed', {
        error: error.message,
        notificationId,
      });
      throw error;
    }
  }

  /**
   * Notify: Post Published Successfully
   */
  async notifyPostPublished(userId, brandId, postData) {
    try {
      // Create in-app notification
      await this.createNotification({
        userId,
        brandId,
        type: 'post_published',
        title: '✅ Post Published Successfully',
        message: `Your post "${postData.content.substring(0, 50)}..." has been published to ${postData.platform}.`,
        data: {
          postId: postData.postId,
          platformName: postData.platform,
          platformPostId: postData.platformPostId,
          platformUrl: postData.platformUrl,
        },
        actionUrl: postData.platformUrl || `/posts/${postData.postId}`,
        actionText: 'View Post',
        priority: 'medium',
      });

      // Send email notification (if user preferences allow)
      // await emailService.sendPostPublishedEmail(...)

      logger.info('✅ Post published notification sent', {
        userId,
        postId: postData.postId,
      });
    } catch (error) {
      logger.error('❌ Notify post published failed', {
        error: error.message,
      });
    }
  }

  /**
   * Notify: Post Publishing Failed
   */
  async notifyPostFailed(userId, brandId, postData, error) {
    try {
      // Create in-app notification
      await this.createNotification({
        userId,
        brandId,
        type: 'post_failed',
        title: '❌ Post Publishing Failed',
        message: `Failed to publish your post to ${postData.platform}. Error: ${error}`,
        data: {
          postId: postData.postId,
          platformName: postData.platform,
          error: error,
        },
        actionUrl: `/posts/${postData.postId}`,
        actionText: 'Retry',
        priority: 'high',
      });

      // Send email notification
      // await emailService.sendPostFailedEmail(...)

      logger.info('✅ Post failed notification sent', {
        userId,
        postId: postData.postId,
      });
    } catch (error) {
      logger.error('❌ Notify post failed failed', {
        error: error.message,
      });
    }
  }

  /**
   * Notify: Channel Disconnected
   */
  async notifyChannelDisconnected(userId, brandId, channelData) {
    try {
      await this.createNotification({
        userId,
        brandId,
        type: 'channel_disconnected',
        title: '⚠️ Social Account Disconnected',
        message: `Your ${channelData.platform} account "${channelData.displayName}" has been disconnected. Please reconnect it.`,
        data: {
          channelId: channelData.channelId,
          platformName: channelData.platform,
        },
        actionUrl: '/channels',
        actionText: 'Reconnect Account',
        priority: 'high',
      });

      logger.info('✅ Channel disconnected notification sent', {
        userId,
        channelId: channelData.channelId,
      });
    } catch (error) {
      logger.error('❌ Notify channel disconnected failed', {
        error: error.message,
      });
    }
  }

  /**
   * Notify: Media Uploaded
   */
  async notifyMediaUploaded(userId, brandId, mediaData) {
    try {
      await this.createNotification({
        userId,
        brandId,
        type: 'media_uploaded',
        title: '📁 Media Uploaded',
        message: `${mediaData.count} file(s) uploaded to your media library.`,
        data: {
          mediaId: mediaData.mediaId,
          count: mediaData.count,
        },
        actionUrl: '/media',
        actionText: 'View Media',
        priority: 'low',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      logger.info('✅ Media uploaded notification sent', {
        userId,
        count: mediaData.count,
      });
    } catch (error) {
      logger.error('❌ Notify media uploaded failed', {
        error: error.message,
      });
    }
  }
}

module.exports = new NotificationService();
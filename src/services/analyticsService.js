const PublishedPost = require('../models/PublishedPost');
const Post = require('../models/Post');
const Channel = require('../models/Channel');
const Brand = require('../models/Brand');
const Membership = require('../models/Membership');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class AnalyticsService {
  /**
   * Check if user has access to brand analytics
   */
  async checkBrandAccess(userId, brandId) {
    // Check direct brand membership
    let membership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    if (membership) return membership;

    // Check organization-level membership
    const brand = await Brand.findById(brandId);
    if (!brand) return null;

    membership = await Membership.findOne({
      user: userId,
      organization: brand.organization,
    });

    return membership;
  }

  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardMetrics(brandId, dateRange = '30d', userId = null) {
    try {
      // If userId provided, check access
      if (userId) {
        const membership = await this.checkBrandAccess(userId, brandId);
        if (!membership) {
          throw new Error('Permission denied');
        }
      }

      const startDate = this.getStartDate(dateRange);

      // 1️⃣ GET PUBLISHED POSTS
      const publishedPosts = await PublishedPost.find({
        brand: brandId,
        publishedAt: { $gte: startDate },
        status: 'published',
      }).populate('channel', 'provider displayName avatar');

      // 2️⃣ GET FAILED POSTS
      const failedPosts = await PublishedPost.find({
        brand: brandId,
        publishedAt: { $gte: startDate },
        status: 'failed',
      });

      // 3️⃣ GET SCHEDULED POSTS
      const scheduledPosts = await Post.find({
        brand: brandId,
        status: 'scheduled',
        'schedules.scheduledFor': { $gte: new Date() },
      });

      // 4️⃣ GET ACTIVE CHANNELS
      const activeChannels = await Channel.find({
        brand: brandId,
        connectionStatus: 'active',
      });

      // 5️⃣ CALCULATE SUMMARY METRICS
      const totalPublished = publishedPosts.length;
      const totalFailed = failedPosts.length;
      const totalScheduled = scheduledPosts.length;
      const totalChannels = activeChannels.length;

      const successRate = totalPublished + totalFailed > 0
        ? ((totalPublished / (totalPublished + totalFailed)) * 100).toFixed(2)
        : 100;

      const daysInRange = this.getDaysInRange(dateRange);
      const postsPerDay = daysInRange > 0
        ? (totalPublished / daysInRange).toFixed(2)
        : 0;

      // 6️⃣ GROUP BY PLATFORM
      const platformStats = this.groupByPlatform(publishedPosts);

      // 7️⃣ GROUP BY CONTENT TYPE
      const contentTypeStats = this.groupByContentType(publishedPosts);

      // 8️⃣ POSTING TRENDS
      const postingTrends = this.calculateTrends(publishedPosts, daysInRange);

      // 9️⃣ TOP POSTING DAYS
      const topPostingDays = this.getTopPostingDays(publishedPosts);

      // 🔟 RECENT ACTIVITY
      const recentActivity = await this.getRecentActivity(brandId, 10);

      return {
        summary: {
          totalPublished,
          totalFailed,
          totalScheduled,
          totalChannels,
          successRate: parseFloat(successRate),
          postsPerDay: parseFloat(postsPerDay),
          period: dateRange,
          dateRange: {
            start: startDate.toISOString(),
            end: new Date().toISOString(),
          },
        },
        platformStats,
        contentTypeStats,
        postingTrends,
        topPostingDays,
        recentActivity,
      };
    } catch (error) {
      logger.error('Dashboard metrics failed', { error: error.message, brandId });
      throw error;
    }
  }

  /**
   * Group published posts by platform
   */
  groupByPlatform(posts) {
    const platformMap = {};

    posts.forEach(post => {
      const provider = post.provider || post.channel?.provider || 'unknown';
      if (!platformMap[provider]) {
        platformMap[provider] = { count: 0 };
      }
      platformMap[provider].count++;
    });

    const total = posts.length || 1;

    return Object.entries(platformMap).map(([provider, data]) => ({
      provider,
      totalPosts: data.count,
      totalChannels: 1,
      percentage: ((data.count / total) * 100).toFixed(1),
    }));
  }

  /**
   * Group by content type
   */
  groupByContentType(posts) {
    const typeMap = {};

    posts.forEach(post => {
      const type = post.mediaType || 'text';
      if (!typeMap[type]) {
        typeMap[type] = 0;
      }
      typeMap[type]++;
    });

    const total = posts.length || 1;

    return Object.entries(typeMap).map(([type, count]) => ({
      type,
      count,
      percentage: ((count / total) * 100).toFixed(1),
    }));
  }

  /**
   * Calculate posting trends over time
   */
  calculateTrends(posts, daysInRange) {
    const trends = [];
    const now = new Date();

    for (let i = Math.min(daysInRange, 30) - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const count = posts.filter(post => {
        const postDate = new Date(post.publishedAt).toISOString().split('T')[0];
        return postDate === dateStr;
      }).length;

      trends.push({ date: dateStr, count });
    }

    return trends;
  }

  /**
   * Get top posting days of the week
   */
  getTopPostingDays(posts) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];

    posts.forEach(post => {
      const day = new Date(post.publishedAt).getDay();
      dayCounts[day]++;
    });

    const total = posts.length || 1;

    return dayNames
      .map((day, index) => ({
        day,
        count: dayCounts[index],
        percentage: ((dayCounts[index] / total) * 100).toFixed(1),
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(brandId, limit = 10) {
    return await PublishedPost.find({ brand: brandId })
      .populate('channel', 'provider displayName avatar')
      .sort({ publishedAt: -1 })
      .limit(limit);
  }

  /**
   * Get channel performance statistics
   */
  async getChannelPerformance(brandId) {
    const channels = await Channel.find({
      brand: brandId,
      connectionStatus: 'active',
    });

    const performance = await Promise.all(
      channels.map(async channel => {
        const [totalPosts, failedPosts, lastPost] = await Promise.all([
          PublishedPost.countDocuments({ channel: channel._id, status: 'published' }),
          PublishedPost.countDocuments({ channel: channel._id, status: 'failed' }),
          PublishedPost.findOne({ channel: channel._id })
            .sort({ publishedAt: -1 })
            .select('publishedAt'),
        ]);

        const successRate = totalPosts + failedPosts > 0
          ? ((totalPosts / (totalPosts + failedPosts)) * 100).toFixed(1)
          : '100.0';

        return {
          channelId: channel._id,
          provider: channel.provider,
          displayName: channel.displayName,
          avatar: channel.avatar,
          connectionStatus: channel.connectionStatus,
          totalPosts,
          failedPosts,
          successRate,
          lastPostAt: lastPost?.publishedAt || null,
        };
      })
    );

    return performance;
  }

  /**
   * Get posting trends for charts
   */
  async getPostingTrends(brandId, dateRange = '30d') {
    const startDate = this.getStartDate(dateRange);

    const posts = await PublishedPost.find({
      brand: brandId,
      publishedAt: { $gte: startDate },
    }).select('publishedAt provider');

    return this.calculateTrends(posts, this.getDaysInRange(dateRange));
  }

  /**
   * Export analytics to CSV format
   */
  async exportToCSV(brandId, dateRange = '30d') {
    const metrics = await this.getDashboardMetrics(brandId, dateRange);

    let csv = 'Metric,Value\n';
    csv += `Total Published,${metrics.summary.totalPublished}\n`;
    csv += `Total Failed,${metrics.summary.totalFailed}\n`;
    csv += `Total Scheduled,${metrics.summary.totalScheduled}\n`;
    csv += `Active Channels,${metrics.summary.totalChannels}\n`;
    csv += `Success Rate,${metrics.summary.successRate}%\n`;
    csv += `Posts Per Day,${metrics.summary.postsPerDay}\n`;
    csv += `Period,${metrics.summary.period}\n`;

    csv += '\nPlatform,Posts,Percentage\n';
    metrics.platformStats.forEach(p => {
      csv += `${p.provider},${p.totalPosts},${p.percentage}%\n`;
    });

    csv += '\nContent Type,Count,Percentage\n';
    metrics.contentTypeStats.forEach(c => {
      csv += `${c.type},${c.count},${c.percentage}%\n`;
    });

    return csv;
  }

  // ========== HELPER METHODS ==========

  /**
   * Calculate start date based on range
   */
  getStartDate(dateRange) {
    const now = new Date();
    switch (dateRange) {
      case '7d':
        return new Date(now.setDate(now.getDate() - 7));
      case '30d':
        return new Date(now.setDate(now.getDate() - 30));
      case '90d':
        return new Date(now.setDate(now.getDate() - 90));
      case 'all':
        return new Date(0);
      default:
        return new Date(now.setDate(now.getDate() - 30));
    }
  }

  /**
   * Get days in range
   */
  getDaysInRange(dateRange) {
    switch (dateRange) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
      case 'all':
        return 365;
      default:
        return 30;
    }
  }
}

module.exports = new AnalyticsService();
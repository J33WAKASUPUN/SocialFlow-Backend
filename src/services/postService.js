const Post = require('../models/Post');
const Channel = require('../models/Channel');
const Membership = require('../models/Membership');
const Media = require('../models/Media');
const Brand = require('../models/Brand');
const queueManager = require('../queues/queueManager');
const logger = require('../utils/logger');

class PostService {
  /**
   * Helper: Check if user has access to brand
   */
  async checkBrandAccess(userId, brandId) {
    // Check direct brand membership
    let membership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    if (membership) {
      return membership;
    }

    // Check organization-level membership
    const brand = await Brand.findById(brandId);
    if (!brand) {
      return null;
    }

    membership = await Membership.findOne({
      user: userId,
      organization: brand.organization,
    });

    return membership;
  }

  /**
   * Create new post
   */
  async createPost(userId, data) {
    const { brandId, title, content, hashtags, mediaUrls, mediaLibraryIds, schedules, settings } = data;

    // Check access
    const membership = await this.checkBrandAccess(userId, brandId);
    if (!membership) {
      throw new Error('Access denied');
    }

    // Check create permission
    if (!membership.hasPermission('create_posts')) {
      throw new Error('Permission denied');
    }

    // Validate schedules have valid channels
    const validatedSchedules = [];
    for (const schedule of schedules || []) {
      const channel = await Channel.findById(schedule.channel || schedule.channelId);
      if (!channel || channel.brand.toString() !== brandId) {
        throw new Error('Invalid channel');
      }

      // FIX: Check if this is an immediate publish (scheduledFor is in the past or within 5 seconds)
      const scheduledDate = new Date(schedule.scheduledFor);
      const now = new Date();
      const isImmediate = scheduledDate.getTime() - now.getTime() < 5000;

      validatedSchedules.push({
        channel: channel._id,
        provider: channel.provider,
        scheduledFor: schedule.scheduledFor,
        status: isImmediate ? 'queued' : 'pending', // Mark as queued for immediate
      });
    }

    // Get media library items if provided
    let mediaLibraryItems = [];
    let resolvedMediaUrls = mediaUrls || [];

    if (mediaLibraryIds && mediaLibraryIds.length > 0) {
      const mediaItems = await Media.find({
        _id: { $in: mediaLibraryIds },
        brand: brandId,
        status: 'active',
      });

      mediaLibraryItems = mediaItems.map(m => m._id);
      resolvedMediaUrls = mediaItems.map(m => m.s3Url);
    }

    // Determine media type
    const mediaType = this.detectMediaType(resolvedMediaUrls);

    // Determine initial status
    let initialStatus = 'draft';
    if (validatedSchedules.length > 0) {
      const hasQueued = validatedSchedules.some(s => s.status === 'queued');
      initialStatus = hasQueued ? 'publishing' : 'scheduled';
    }

    // Create post
    const post = new Post({
      brand: brandId,
      createdBy: userId,
      title: data.title,
      content: data.content,
      hashtags: data.hashtags,
      mediaUrls: resolvedMediaUrls,
      mediaType,
      mediaLibraryItems,
      schedules: validatedSchedules,
      status: initialStatus,
      settings: settings || {},
    });

    await post.save();

    // If scheduled, add to queue
    for (const schedule of post.schedules) {
      if (schedule.scheduledFor) {
        const job = await queueManager.addPublishJob(
          post._id,
          schedule._id,
          new Date(schedule.scheduledFor)
        );
        schedule.jobId = job.id;
      }
    }

    await post.save();

    logger.info('Post created', {
      postId: post._id,
      brandId,
      userId,
      schedules: post.schedules.length,
      status: post.status,
    });

    // Return populated post
    return await Post.findById(post._id)
      .populate('createdBy', 'name email')
      .populate('schedules.channel', 'provider displayName avatar')
      .populate('mediaLibraryItems', 's3Url originalName type');
  }

  /**
   * Get brand posts
   */
  async getBrandPosts(userId, brandId, filters = {}) {
    try {
      // Check user access - allow any organization member to view posts
      const membership = await this.checkBrandAccess(userId, brandId);

      if (!membership) {
        throw new Error('Permission denied');
      }

      // Check if user can view posts
      if (!membership.hasPermission('view_posts') && !membership.hasPermission('view_analytics')) {
        throw new Error('Permission denied');
      }

      // Build query
      const query = { brand: brandId };

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.createdBy) {
        query.createdBy = filters.createdBy;
      }

      // Fetch posts with populated data
      const posts = await Post.find(query)
        .populate('createdBy', 'name email')
        .populate({
          path: 'schedules.channel',
          select: 'provider displayName avatar platformUsername',
        })
        .populate({
          path: 'mediaLibraryItems',
          select: 's3Url originalName type size',
        })
        .sort({ createdAt: -1 })
        .limit(filters.limit || 100);

      return posts;
    } catch (error) {
      logger.error('Get brand posts failed', { error: error.message, userId, brandId });
      throw error;
    }
  }

  /**
   * Update post (only for drafts and scheduled posts)
   */
  async updatePost(userId, postId, data) {
    const post = await Post.findById(postId);

    if (!post) {
      throw new Error('Post not found');
    }

    // Check access
    const membership = await this.checkBrandAccess(userId, post.brand);
    if (!membership) {
      throw new Error('Access denied');
    }

    // Check permission
    if (!membership.hasPermission('create_posts')) {
      throw new Error('Permission denied');
    }

    // Can only update drafts and scheduled posts
    if (!['draft', 'scheduled'].includes(post.status)) {
      throw new Error('Cannot update published or failed posts');
    }

    // Update fields
    if (data.title !== undefined) post.title = data.title;
    if (data.content !== undefined) post.content = data.content;
    if (data.hashtags !== undefined) post.hashtags = data.hashtags;

    // Handle media updates
    if (data.mediaLibraryIds !== undefined) {
      const mediaItems = await Media.find({
        _id: { $in: data.mediaLibraryIds },
        brand: post.brand,
        status: 'active',
      });

      post.mediaLibraryItems = mediaItems.map(m => m._id);
      post.mediaUrls = mediaItems.map(m => m.s3Url);
      post.mediaType = this.detectMediaType(post.mediaUrls);
    }

    // Handle schedule updates
    if (data.schedules !== undefined) {
      // Cancel existing jobs
      for (const schedule of post.schedules) {
        if (schedule.jobId) {
          await queueManager.cancelJob(schedule.jobId);
        }
      }

      // Validate and create new schedules
      const validatedSchedules = [];
      for (const schedule of data.schedules) {
        const channel = await Channel.findById(schedule.channel || schedule.channelId);
        if (!channel || channel.brand.toString() !== post.brand.toString()) {
          throw new Error('Invalid channel');
        }

        validatedSchedules.push({
          channel: channel._id,
          provider: channel.provider,
          scheduledFor: schedule.scheduledFor,
          status: 'pending',
        });
      }

      post.schedules = validatedSchedules;

      // Queue new schedules
    for (const schedule of post.schedules) {
      if (schedule.scheduledFor) {
        const job = await queueManager.addPublishJob(
          post._id,
          schedule._id,
          new Date(schedule.scheduledFor)
        );
        schedule.status = 'queued';
        schedule.jobId = job.id;
        post.status = 'publishing';
      }
    }

      post.status = validatedSchedules.length > 0 ? 'scheduled' : 'draft';
    }

    await post.save();

    return await Post.findById(post._id)
      .populate('createdBy', 'name email')
      .populate('schedules.channel', 'provider displayName avatar')
      .populate('mediaLibraryItems', 's3Url originalName type');
  }

  /**
   * Delete post (from DB AND platform if published)
   */
  async deletePost(userId, postId) {
    const post = await Post.findById(postId);

    if (!post) {
      throw new Error('Post not found');
    }

    // Check access
    const membership = await this.checkBrandAccess(userId, post.brand);
    if (!membership) {
      throw new Error('Access denied');
    }

    // Check permission
    if (!membership.hasPermission('create_posts')) {
      throw new Error('Permission denied');
    }

    // Cancel any queued jobs
    for (const schedule of post.schedules) {
      if (schedule.jobId) {
        await queueManager.cancelJob(schedule.jobId);
      }
    }

    // Delete from DB
    await Post.findByIdAndDelete(postId);

    logger.info('Post deleted', { postId, userId });

    return { success: true };
  }

  /**
   * Cancel scheduled post
   */
  async cancelSchedule(userId, postId, scheduleId) {
    const post = await Post.findById(postId);

    if (!post) {
      throw new Error('Post not found');
    }

    // Check access
    const membership = await this.checkBrandAccess(userId, post.brand);
    if (!membership) {
      throw new Error('Access denied');
    }

    const schedule = post.schedules.id(scheduleId);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.status !== 'pending' && schedule.status !== 'queued') {
      throw new Error('Cannot cancel this schedule');
    }

    // Cancel queue job
    if (schedule.jobId) {
      await queueManager.cancelJob(schedule.jobId);
    }

    schedule.status = 'cancelled';
    await post.save();

    // Update post status if no more pending schedules
    const hasPendingSchedules = post.schedules.some(
      s => ['pending', 'queued'].includes(s.status)
    );

    if (!hasPendingSchedules) {
      post.status = 'draft';
      await post.save();
    }

    return post;
  }

  /**
   * Get calendar view
   */
  async getCalendar(userId, brandId, startDate, endDate) {
    // Check access using helper
    const membership = await this.checkBrandAccess(userId, brandId);

    if (!membership) {
      throw new Error('Access denied');
    }

    // Parse dates correctly in UTC
    const start = new Date(startDate);
    const end = new Date(endDate);

    logger.info('📅 Calendar query', {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    const posts = await Post.find({
      brand: brandId,
      'schedules.scheduledFor': {
        $gte: start,
        $lte: end,
      },
    })
      .populate('createdBy', 'name avatar')
      .populate('schedules.channel', 'provider displayName')
      .sort({ 'schedules.scheduledFor': 1 });

    // Group by date
    const calendar = {};

    posts.forEach(post => {
      post.schedules.forEach(schedule => {
        if (schedule.scheduledFor) {
          const dateKey = schedule.scheduledFor.toISOString().split('T')[0];
          if (!calendar[dateKey]) {
            calendar[dateKey] = [];
          }
          calendar[dateKey].push({
            ...post.toObject(),
            scheduleId: schedule._id,
            scheduledFor: schedule.scheduledFor,
            scheduleStatus: schedule.status,
          });
        }
      });
    });

    return calendar;
  }

  /**
   * Detect media type from URLs
   */
  detectMediaType(mediaUrls) {
    if (!mediaUrls || mediaUrls.length === 0) {
      return 'none';
    }

    const hasVideo = mediaUrls.some(url =>
      /\.(mp4|mov|avi|webm|mkv)$/i.test(url)
    );

    if (hasVideo) {
      return 'video';
    }

    if (mediaUrls.length > 1) {
      return 'multiImage';
    }

    return 'image';
  }
}

module.exports = new PostService();
const postService = require('../services/postService');

class PostController {
  /**
   * POST /api/v1/posts
   */
  async createPost(req, res, next) {
    try {
      // LOG INCOMING REQUEST
      console.log('📥 Create post request', {
        body: req.body,
        hasMediaUrls: !!req.body.mediaUrls,
        hasMediaLibraryIds: !!req.body.mediaLibraryIds,
      });

      const post = await postService.createPost(req.user._id, req.body);

      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        data: post,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/posts
   */
  async getPosts(req, res, next) {
    try {
      const { brandId, status, createdBy, limit } = req.query;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: 'Brand ID is required',
        });
      }

      // The postService.getBrandPosts now handles org-level access
      const posts = await postService.getBrandPosts(req.user._id, brandId, {
        status,
        createdBy,
        limit: limit ? parseInt(limit) : undefined,
      });

      res.json({
        success: true,
        data: posts,
      });
    } catch (error) {
      if (error.message === 'Permission denied') {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this brand\'s posts',
        });
      }
      next(error);
    }
  }

  /**
   * GET /api/v1/posts/:id
   */
  async getPostById(req, res, next) {
    try {
      const Post = require('../models/Post');
      const post = await Post.findById(req.params.id)
        .populate('createdBy', 'name email avatar')
        .populate('schedules.channel', 'provider displayName');

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      res.json({
        success: true,
        data: post,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/posts/:id
   */
  async updatePost(req, res, next) {
    try {
      const post = await postService.updatePost(
        req.user._id,
        req.params.id,
        req.body
      );

      res.json({
        success: true,
        message: 'Post updated successfully',
        data: post,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/posts/:id
   */
  async deletePost(req, res, next) {
    try {
      const Post = require('../models/Post');
      await Post.findByIdAndDelete(req.params.id);

      res.json({
        success: true,
        message: 'Post deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/posts/:id/schedule
   */
  async schedulePost(req, res, next) {
    try {
      const { schedules } = req.body;

      if (!schedules || schedules.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Schedules are required',
        });
      }

      const Post = require('../models/Post');
      const post = await Post.findById(req.params.id);

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      // Add schedules logic here

      res.json({
        success: true,
        message: 'Post scheduled successfully',
        data: post,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/posts/:postId/schedules/:scheduleId
   */
  async cancelSchedule(req, res, next) {
    try {
      const post = await postService.cancelSchedule(
        req.user._id,
        req.params.postId,
        req.params.scheduleId
      );

      res.json({
        success: true,
        message: 'Schedule cancelled successfully',
        data: post,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/posts/calendar
   */
  async getCalendar(req, res, next) {
    try {
      const { brandId, startDate, endDate } = req.query;

      if (!brandId || !startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'brandId, startDate, and endDate are required',
        });
      }

      const calendar = await postService.getCalendar(
        req.user._id,
        brandId,
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: calendar,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PostController();
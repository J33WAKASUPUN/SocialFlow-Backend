const channelService = require("../services/channelService");
const ProviderFactory = require("../providers/ProviderFactory");
const Channel = require("../models/Channel");
const PublishedPost = require("../models/PublishedPost");
const Media = require('../models/Media');
const s3Service = require('../services/s3Service');
const mongoose = require("mongoose");
const path = require("path");
const logger = require("../utils/logger");
const cloudinaryService = require('../services/cloudinaryService');

class ChannelController {
  async getAuthorizationUrl(req, res, next) {
    try {
      const { provider } = req.params;
      const { brandId, returnUrl } = req.query;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: "Brand ID is required",
        });
      }

      const result = await channelService.getAuthorizationUrl(
        provider,
        brandId,
        req.user._id,
        returnUrl
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async handleCallback(req, res, next) {
    try {
      const { provider } = req.params;
      const { code, state, error, error_description } = req.query;

      // Enhanced error logging
      logger.info("OAuth callback received", {
        provider,
        hasCode: !!code,
        hasState: !!state,
        state: state ? state.substring(0, 16) + "..." : "missing",
        error: error || null,
      });

      if (error) {
        logger.error("OAuth provider error", {
          provider,
          error,
          error_description,
        });
        const frontendUrl = process.env.CLIENT_URL || "http://localhost:5173";
        return res.redirect(
          `${frontendUrl}/channels?error=${encodeURIComponent(
            error_description || error
          )}`
        );
      }

      if (!code || !state) {
        logger.error("Missing code or state in callback", {
          hasCode: !!code,
          hasState: !!state,
        });
        return res.status(400).json({
          success: false,
          message: "Authorization code and state are required",
        });
      }

      const result = await channelService.handleCallback(provider, code, state);

      logger.info("OAuth callback successful", {
        provider,
        channelId: result.channel._id,
        isNew: result.isNew,
      });

      const redirectUrl = `${result.returnUrl}/channels?success=true&provider=${provider}&new=${result.isNew}`;
      res.redirect(redirectUrl);
    } catch (error) {
      // ✅ IMPROVED ERROR HANDLING
      logger.error("OAuth callback error:", {
        message: error.message,
        stack: error.stack,
        provider: req.params.provider,
      });

      const frontendUrl = process.env.CLIENT_URL || "http://localhost:5173";

      // ✅ CHECK IF HEADERS ALREADY SENT
      if (res.headersSent) {
        logger.error("Headers already sent, cannot redirect");
        return next(error);
      }

      if (error.message.includes("OAuth state")) {
        // State validation error - redirect to frontend with helpful message
        return res.redirect(
          `${frontendUrl}/channels?error=${encodeURIComponent(
            "Session expired. Please try connecting again."
          )}`
        );
      }

      // ✅ GENERIC ERROR REDIRECT
      return res.redirect(
        `${frontendUrl}/channels?error=${encodeURIComponent(
          "Authentication failed. Please try again."
        )}`
      );
    }
  }

  async getBrandChannels(req, res, next) {
    try {
      const { brandId, includeDisconnected } = req.query;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: "Brand ID is required",
        });
      }

      const channels = await channelService.getBrandChannels(
        brandId,
        req.user._id,
        includeDisconnected === "true"
      );

      res.json({
        success: true,
        data: channels,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDisconnectedChannels(req, res, next) {
    try {
      const { brandId } = req.query;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: "Brand ID is required",
        });
      }

      const channels = await channelService.getDisconnectedChannels(
        brandId,
        req.user._id
      );

      res.json({
        success: true,
        data: channels,
        message:
          channels.length > 0
            ? "Reconnect these channels to resume posting"
            : "No disconnected channels",
      });
    } catch (error) {
      next(error);
    }
  }

  async testConnection(req, res, next) {
    try {
      const result = await channelService.testConnection(
        req.params.id,
        req.user._id
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async disconnectChannel(req, res, next) {
    try {
      await channelService.disconnectChannel(req.params.id, req.user._id);

      res.json({
        success: true,
        message: "Channel disconnected successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req, res, next) {
    try {
      const result = await channelService.refreshToken(
        req.params.id,
        req.user._id
      );

      res.json({
        success: true,
        message: "Token refreshed successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async testPublish(req, res, next) {
    try {
      const content = req.body.content;
      const title = req.body.title || "Test Post";
      const hashtags = req.body.hashtags || [];

      if (!content) {
        return res.status(400).json({
          success: false,
          message: "Content is required",
        });
      }

      const channel = await Channel.findById(req.params.id).populate("brand");
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: "Channel not found",
        });
      }

      const provider = ProviderFactory.getProvider(channel.provider, channel);

      let mediaUrls = [];

      // Priority 1: Handle uploaded files from multipart/form-data
      if (req.files && req.files.length > 0) {
        console.log("📁 Uploaded files detected:", req.files.length);

        // Get absolute paths to uploaded files
        mediaUrls = req.files.map((file) => {
          const absolutePath = path.resolve(file.path);
          console.log("   - File:", file.originalname, "→", absolutePath);
          return absolutePath;
        });
      }
      // Priority 2: Handle URLs from request body
      else if (req.body.mediaUrls) {
        console.log("🔗 Media URLs from body");

        if (Array.isArray(req.body.mediaUrls)) {
          mediaUrls = req.body.mediaUrls;
        } else if (typeof req.body.mediaUrls === "string") {
          mediaUrls = req.body.mediaUrls.split(",").map((url) => url.trim());
        }

        console.log("   - URLs:", mediaUrls);
      }

      console.log("🚀 Publishing with:", {
        content: content.substring(0, 50) + "...",
        mediaCount: mediaUrls.length,
        mediaType: mediaUrls.length > 0 ? "with media" : "text only",
      });

      // Publish to platform
      const result = await provider.publish({
        content,
        mediaUrls,
        title,
        hashtags,
      });

      // SAVE TO DATABASE
      const publishedPost = await PublishedPost.create({
        brand: channel.brand._id,
        channel: channel._id,
        publishedBy: req.user._id,
        provider: channel.provider,
        platformPostId: result.platformPostId,
        platformUrl: result.platformUrl,
        title,
        content,
        mediaUrls,
        mediaType: result.mediaType || "none",
        status: "published",
        publishedAt: new Date(),
      });

      res.json({
        success: true,
        message: "Post published and saved successfully",
        data: {
          platform: result,
          database: {
            id: publishedPost._id,
            platformPostId: publishedPost.platformPostId,
            status: publishedPost.status,
            publishedAt: publishedPost.publishedAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test publish with LOCAL FILE upload + S3 + MEDIA LIBRARY
   */
async testPublishLocal(req, res, next) {
    try {
      const content = req.body.content;
      const title = req.body.title || undefined;
      
      // Parse metadata
      let metadata = {};
      if (req.body.metadata) {
        try {
          metadata = typeof req.body.metadata === 'string' 
            ? JSON.parse(req.body.metadata)
            : req.body.metadata;
        } catch (parseError) {
          logger.warn('Failed to parse metadata', { error: parseError.message });
        }
      }

      if (!content) {
        return res.status(400).json({
          success: false,
          message: "Content is required",
        });
      }

      const channel = await Channel.findById(req.params.id).populate("brand");
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: "Channel not found",
        });
      }

      const provider = ProviderFactory.getProvider(channel.provider, channel);

      let mediaUrls = [];
      const savedMediaItems = []; // TRACK SAVED MEDIA

      // CHECK IF FILES EXIST
      if (!req.files || req.files.length === 0) {
        logger.warn('⚠️ No files received in request');
        logger.info('Request details:', {
          contentType: req.headers['content-type'],
          bodyKeys: Object.keys(req.body),
          hasFiles: !!req.files,
        });
      } else {
        logger.info("📁 Uploading files to S3 and saving to Media Library", { count: req.files.length });

        for (const file of req.files) {
          try {
            // SAVE TO MEDIA LIBRARY
            const savedMedia = await mediaService.uploadMedia(
              file,
              req.user._id,
              channel.brand._id,
              {
                folder: 'test-uploads',
                tags: ['test', channel.provider],
                altText: `Test upload for ${channel.provider}`,
                caption: content.substring(0, 100),
              }
            );

            logger.info("✅ File uploaded to S3 and saved to Media Library", {
              originalName: file.originalname,
              s3Url: savedMedia.s3Url,
              mediaId: savedMedia._id,
              size: `${(savedMedia.size / 1024 / 1024).toFixed(2)}MB`,
            });

            mediaUrls.push(savedMedia.s3Url);
            savedMediaItems.push(savedMedia); // TRACK FOR RESPONSE

          } catch (uploadError) {
            logger.error(`❌ Failed to upload ${file.originalname}`, {
              error: uploadError.message,
              stack: uploadError.stack,
            });

            // Delete local file if it still exists
            try {
              const fs = require('fs').promises;
              await fs.unlink(file.path);
            } catch (unlinkError) {
              logger.warn(`⚠️ Failed to delete local file ${file.path}`);
            }

            return res.status(500).json({
              success: false,
              message: `Failed to upload ${file.originalname}: ${uploadError.message}`,
            });
          }
        }
      }

      logger.info("🚀 Publishing with S3 URLs", {
        content: content.substring(0, 50) + "...",
        mediaCount: mediaUrls.length,
        mediaUrls: mediaUrls,
        metadata: metadata,
      });

      // Publish to platform (social media will download from S3)
      const result = await provider.publish({
        content,
        title,
        mediaUrls, // Pass S3 URLs here
        metadata,
      });

      logger.info("✅ Post published successfully", {
        platformPostId: result.platformPostId,
        provider: channel.provider,
        s3Urls: mediaUrls,
      });

      // Save to database
      const publishedPost = await PublishedPost.create({
        brand: channel.brand._id,
        channel: channel._id,
        publishedBy: req.user._id,
        provider: channel.provider,
        platformPostId: result.platformPostId,
        platformUrl: result.platformUrl,
        title: result.title,
        content: content,
        mediaUrls: result.mediaUrls || mediaUrls, // Use result mediaUrls if available, else S3 URLs
        mediaType: result.mediaType || (mediaUrls.length > 0 ? "image" : "none"),
        status: "published",
        publishedAt: new Date(),
      });

      // MARK MEDIA AS USED
      if (savedMediaItems.length > 0) {
        await Promise.all(
          savedMediaItems.map(media => media.markAsUsed(publishedPost._id))
        );
      }

      res.json({
        success: true,
        message: "Post published and saved successfully",
        data: {
          platform: result,
          database: {
            id: publishedPost._id,
            platformPostId: publishedPost.platformPostId,
            status: publishedPost.status,
            publishedAt: publishedPost.publishedAt,
          },
          s3: {
            urls: mediaUrls,
            bucket: process.env.AWS_S3_BUCKET_NAME,
            message: mediaUrls.length > 0 
              ? "Media hosted on AWS S3 and saved to Media Library" 
              : "No media uploaded",
          },
          mediaLibrary: savedMediaItems.map(m => ({
            id: m._id,
            filename: m.filename,
            s3Url: m.s3Url,
            usageCount: m.usageCount,
          })),
        },
      });
    } catch (error) {
      logger.error("❌ Test publish failed", {
        error: error.message,
        stack: error.stack,
      });
      next(error);
    }
  }


  async testUpdate(req, res, next) {
    try {
      const { platformPostId, content } = req.body;

      if (!platformPostId || !content) {
        return res.status(400).json({
          success: false,
          message: "platformPostId and content are required",
        });
      }

      const channel = await Channel.findById(req.params.id);
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: "Channel not found",
        });
      }

      const provider = ProviderFactory.getProvider(channel.provider, channel);

      // Update on platform
      const result = await provider.updatePost(platformPostId, content);

      // UPDATE IN DATABASE
      const publishedPost = await PublishedPost.findOneAndUpdate(
        {
          channel: channel._id,
          platformPostId: platformPostId,
        },
        {
          content: content,
          status: "updated",
          updatedAt: new Date(),
        },
        { new: true }
      );

      if (!publishedPost) {
        const existingPosts = await PublishedPost.find({
          channel: channel._id,
        }).select("platformPostId provider status");

        console.log("🔍 Existing posts in DB:", existingPosts);

        return res.status(404).json({
          success: false,
          message:
            "Post not found in database. It may not have been published through this platform.",
          debug: {
            searchedFor: {
              channel: channel._id,
              platformPostId: platformPostId,
            },
            existingPosts: existingPosts.map((p) => ({
              id: p._id,
              platformPostId: p.platformPostId,
              provider: p.provider,
            })),
          },
        });
      }

      res.json({
        success: true,
        message: "Post updated successfully",
        data: {
          platform: result,
          database: publishedPost,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async testDelete(req, res, next) {
    try {
      const { platformPostId } = req.body;

      if (!platformPostId) {
        return res.status(400).json({
          success: false,
          message: "platformPostId is required",
        });
      }

      const channel = await Channel.findById(req.params.id);
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: "Channel not found",
        });
      }

      const provider = ProviderFactory.getProvider(channel.provider, channel);

      // Delete from platform
      const result = await provider.deletePost(platformPostId);

      // SOFT DELETE IN DATABASE
      const publishedPost = await PublishedPost.findOneAndUpdate(
        {
          provider: channel.provider,
          platformPostId: platformPostId,
        },
        {
          status: "deleted",
          deletedAt: new Date(),
        },
        { new: true }
      );

      res.json({
        success: true,
        message: "Post deleted successfully",
        data: {
          platform: result,
          database: publishedPost,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Permanently delete channel and all associated data
  async permanentlyDeleteChannel(req, res, next) {
    try {
      const result = await channelService.permanentlyDeleteChannel(
        req.params.id,
        req.user._id
      );

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDeleteImpact(req, res, next) {
    try {
      const channel = await Channel.findById(req.params.id);

      if (!channel) {
        return res.status(404).json({
          success: false,
          message: "Channel not found",
        });
      }

      const PublishedPost = require("../models/PublishedPost");
      const postCount = await PublishedPost.countDocuments({
        channel: req.params.id,
      });

      res.json({
        success: true,
        data: {
          channel: {
            provider: channel.provider,
            displayName: channel.displayName,
            platformUsername: channel.platformUsername,
          },
          impact: {
            publishedPosts: postCount,
            canReconnect: false,
            dataLoss: "permanent",
          },
          warning:
            "This action cannot be undone. All data will be permanently deleted.",
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get published posts
  async getPosts(req, res, next) {
    try {
      const {
        brandId,
        channelId,
        provider,
        status,
        limit = 50,
        skip = 0,
      } = req.query;

      console.log("📊 Get Posts Query:", {
        brandId,
        channelId,
        provider,
        status,
        limit,
        skip,
      });

      // Build query
      const query = {};

      if (brandId) {
        query.brand = new mongoose.Types.ObjectId(brandId);
      }

      if (channelId) {
        query.channel = new mongoose.Types.ObjectId(channelId);
      }

      if (provider) {
        query.provider = provider;
      }

      if (status) {
        query.status = status;
      } else {
        query.status = { $ne: "deleted" };
      }

      console.log("📝 MongoDB Query:", JSON.stringify(query, null, 2));

      const posts = await PublishedPost.find(query)
        .populate("channel", "provider displayName avatar")
        .populate("publishedBy", "name email avatar")
        .sort({ publishedAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip));

      const total = await PublishedPost.countDocuments(query);

      console.log(`✅ Found ${posts.length} posts (Total: ${total})`);

      res.json({
        success: true,
        message: "Posts retrieved successfully",
        data: {
          posts,
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          hasMore: total > parseInt(skip) + parseInt(limit),
        },
      });
    } catch (error) {
      console.error("❌ Get Posts Error:", error);
      next(error);
    }
  }
}

module.exports = new ChannelController();

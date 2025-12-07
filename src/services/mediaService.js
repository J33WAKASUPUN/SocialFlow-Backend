const Media = require("../models/Media");
const Folder = require("../models/Folder");
const s3Service = require("./s3Service");
const sharp = require("sharp");
const logger = require("../utils/logger");
const path = require("path");
const mongoose = require("mongoose");

class MediaService {
  /**
   * Upload media file to S3 and save to database
   */
  async uploadMedia(file, userId, brandId, options = {}) {
    try {
      logger.info("📤 Uploading media to library", {
        originalName: file.originalname,
        size: file.size,
        brandId,
        tags: options.tags,
      });

      const type = this.getMediaType(file.mimetype);
      const uploadResult = await s3Service.uploadFile(file.path, "media", {
        brandId: brandId.toString(),
        uploadedBy: userId.toString(),
        type,
      });

      const metadata = await this.extractMetadata(file.path, type);

      const media = await Media.create({
        brand: brandId,
        uploadedBy: userId,
        filename: uploadResult.fileName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: uploadResult.size,
        s3Key: uploadResult.key,
        s3Url: uploadResult.url,
        s3Bucket: uploadResult.bucket,
        type,
        metadata,
        tags: options.tags || [],
        folder: options.folder || "Default",
        altText: options.altText || "",
        caption: options.caption || "",
      });

      logger.info("✅ Media uploaded successfully", {
        mediaId: media._id,
        s3Url: media.s3Url,
        folder: media.folder,
        tags: media.tags,
      });

      return media;
    } catch (error) {
      logger.error("❌ Media upload failed", {
        error: error.message,
        file: file.originalname,
      });
      throw error;
    }
  }

  /**
 * Get media library for a brand
 */
async getMediaLibrary(brandId, filters = {}) {
  try {
    const query = {
      brand: brandId,
      status: 'active',
    };

    // Type filter
    if (filters.type) {
      query.type = filters.type;
    }

    // ✅ FIX: Only add folder filter if it's explicitly provided and not 'all'
    if (filters.folder && filters.folder !== 'all') {
      query.folder = filters.folder.trim();
    }
    // ✅ DON'T add folder: undefined to query

    // Search filter
    if (filters.search) {
      query.$or = [
        { originalName: { $regex: filters.search, $options: 'i' } },
        { filename: { $regex: filters.search, $options: 'i' } },
        { tags: { $in: [new RegExp(filters.search, 'i')] } },
      ];
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $all: filters.tags };
    }

    // ✅ LOG THE EXACT QUERY
    console.log('🔍 Media Query:', JSON.stringify(query, null, 2));

    const sortField = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
    const sortOptions = { [sortField]: sortOrder };

    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 50;
    const skip = (page - 1) * limit;

    const [media, total] = await Promise.all([
      Media.find(query)
        .populate('uploadedBy', 'name email')
        .sort(sortOptions)
        .limit(limit)
        .skip(skip),
      Media.countDocuments(query),
    ]);

    console.log('✅ Media fetched:', {
      total,
      returned: media.length,
      folders: [...new Set(media.map(m => m.folder))],
    });

    return {
      media,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error('❌ Get media library failed:', {
      error: error.message,
      stack: error.stack,
      filters,
    });
    throw error;
  }
}

  /**
   * Get single media by ID
   */
  async getMediaById(mediaId, brandId) {
    try {
      const media = await Media.findOne({
        _id: mediaId,
        brand: brandId,
        status: { $ne: "deleted" },
      }).populate("uploadedBy", "name email avatar");

      if (!media) {
        throw new Error("Media not found");
      }

      return media;
    } catch (error) {
      logger.error("❌ Get media by ID failed", {
        error: error.message,
        mediaId,
      });
      throw error;
    }
  }

  /**
   * Update media metadata
   */
  async updateMedia(mediaId, brandId, updates) {
    try {
      const allowedUpdates = ["folder", "tags", "altText", "caption"];
      const filteredUpdates = {};

      Object.keys(updates).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });

      const media = await Media.findOneAndUpdate(
        { _id: mediaId, brand: brandId, status: { $ne: "deleted" } },
        { $set: filteredUpdates },
        { new: true, runValidators: true }
      );

      if (!media) {
        throw new Error("Media not found");
      }

      logger.info("✅ Media updated", { mediaId, updates: filteredUpdates });

      return media;
    } catch (error) {
      logger.error("❌ Update media failed", {
        error: error.message,
        mediaId,
      });
      throw error;
    }
  }

  /**
   * Delete media (soft delete)
   */
  async deleteMedia(mediaId, brandId) {
    try {
      const media = await Media.findOne({
        _id: mediaId,
        brand: brandId,
      });

      if (!media) {
        throw new Error("Media not found");
      }

      // Check if media is used in any posts
      if (media.usageCount > 0) {
        throw new Error(
          `Cannot delete media that is used in ${media.usageCount} post(s). Archive it instead.`
        );
      }

      // Soft delete
      await media.softDelete();

      // Optionally delete from S3 (uncomment if you want hard delete)
      // await s3Service.deleteFile(media.s3Key);

      logger.info("✅ Media deleted", { mediaId });

      return { success: true, message: "Media deleted successfully" };
    } catch (error) {
      logger.error("❌ Delete media failed", {
        error: error.message,
        mediaId,
      });
      throw error;
    }
  }

  /**
   * Bulk delete media
   */
  async bulkDeleteMedia(mediaIds, brandId) {
    try {
      const results = {
        deleted: [],
        failed: [],
      };

      for (const mediaId of mediaIds) {
        try {
          await this.deleteMedia(mediaId, brandId);
          results.deleted.push(mediaId);
        } catch (error) {
          results.failed.push({ mediaId, error: error.message });
        }
      }

      return results;
    } catch (error) {
      logger.error("❌ Bulk delete failed", { error: error.message });
      throw error;
    }
  }

  /**
   * Get folders for a brand
   */
  async getFolders(brandId) {
    try {
      const folders = await Media.distinct("folder", {
        brand: brandId,
        status: "active",
      });

      return folders.sort();
    } catch (error) {
      logger.error("❌ Get folders failed", { error: error.message });
      throw error;
    }
  }

  /**
   * Get popular tags for a brand
   */
  async getPopularTags(brandId, limit = 20) {
    try {
      // Ensure brandId is ObjectId and add proper matching
      const tags = await Media.aggregate([
        {
          $match: {
            brand: new mongoose.Types.ObjectId(brandId),
            status: "active",
            tags: { $exists: true, $ne: [] }, // Only include documents with tags
          },
        },
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]);

      return tags.map((t) => ({ tag: t._id, count: t.count }));
    } catch (error) {
      logger.error("❌ Get popular tags failed", {
        error: error.message,
        stack: error.stack,
        brandId,
      });
      throw error;
    }
  }

  /**
   * Format bytes to human-readable size
   */
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(brandId) {
    try {
      // Get stats by type
      const stats = await Media.aggregate([
        {
          $match: {
            brand: new mongoose.Types.ObjectId(brandId),
            status: "active",
          },
        },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            totalSize: { $sum: "$size" },
          },
        },
      ]);

      // Get total stats
      const totalStats = await Media.aggregate([
        {
          $match: {
            brand: new mongoose.Types.ObjectId(brandId),
            status: "active",
          },
        },
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            totalSize: { $sum: "$size" },
          },
        },
      ]);

      // Get unique folder count
      const folderCount = await Media.distinct("folder", {
        brand: brandId,
        status: "active",
      });

      // Format response
      const byType = stats.map((stat) => ({
        type: stat._id,
        count: stat.count,
        totalSize: stat.totalSize,
        sizeFormatted: this.formatBytes(stat.totalSize),
      }));

      const total = totalStats[0] || { totalCount: 0, totalSize: 0 };

      return {
        totalFiles: total.totalCount,
        totalSize: total.totalSize,
        totalSizeFormatted: this.formatBytes(total.totalSize),
        folderCount: folderCount.length,
        byType,
      };
    } catch (error) {
      logger.error("❌ Get storage stats failed", {
        error: error.message,
        brandId,
      });
      throw error;
    }
  }

  /**
   * Extract metadata from media file
   */
  async extractMetadata(filePath, type) {
    try {
      if (type === "image") {
        const metadata = await sharp(filePath).metadata();

        return {
          width: metadata.width,
          height: metadata.height,
          aspectRatio: this.calculateAspectRatio(
            metadata.width,
            metadata.height
          ),
          format: metadata.format,
        };
      }

      // For videos, you'd use a library like fluent-ffmpeg
      // Simplified version here
      if (type === "video") {
        return {
          format: path.extname(filePath).substring(1),
        };
      }

      return {};
    } catch (error) {
      logger.warn("⚠️ Failed to extract metadata", {
        error: error.message,
        filePath,
      });
      return {};
    }
  }

  /**
   * Get media type from MIME type
   */
  getMediaType(mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    return "document";
  }

  /**
   * Calculate aspect ratio
   */
  calculateAspectRatio(width, height) {
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
  }

   /**
   * Create new folder
   */
  async createFolder(brandId, userId, folderData) {
    try {
      const { name, description, color } = folderData;

      // Check if folder already exists
      const existing = await Folder.findOne({
        brand: brandId,
        name,
      });

      if (existing) {
        throw new Error('Folder already exists');
      }

      // Create folder in database
      const folder = await Folder.create({
        brand: brandId,
        name,
        description,
        color: color || '#667eea',
        createdBy: userId,
      });

      logger.info('✅ Folder created', { brandId, name, folderId: folder._id });

      return {
        name: folder.name,
        description: folder.description,
        color: folder.color,
        mediaCount: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        createdAt: folder.createdAt,
      };
    } catch (error) {
      logger.error('❌ Create folder failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Rename folder (UPDATED)
   */
  async renameFolder(brandId, oldName, newName) {
    try {
      // Update folder in Folder collection
      await Folder.updateOne(
        {
          brand: brandId,
          name: oldName,
        },
        {
          $set: { name: newName },
        }
      );

      // Update all media with old folder name
      const result = await Media.updateMany(
        {
          brand: brandId,
          folder: oldName,
          status: 'active',
        },
        {
          $set: { folder: newName },
        }
      );

      logger.info('✅ Folder renamed', { oldName, newName, updated: result.modifiedCount });

      return { success: true, updated: result.modifiedCount };
    } catch (error) {
      logger.error('❌ Rename folder failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete folder (UPDATED)
   */
 async deleteFolder(brandId, folderName) {
    try {
      // Prevent deletion of "Default" folder
      if (folderName === 'Default') {
        throw new Error('Cannot delete the Default folder');
      }

      // Delete from Folder collection
      await Folder.deleteOne({
        brand: brandId,
        name: folderName,
      });

      // Move all media to "Default" instead of "uncategorized"
      const result = await Media.updateMany(
        {
          brand: brandId,
          folder: folderName,
          status: 'active',
        },
        {
          $set: { folder: 'Default' }, // "uncategorized"
        }
      );

      logger.info('✅ Folder deleted', { folderName, moved: result.modifiedCount });

      return { success: true, moved: result.modifiedCount };
    } catch (error) {
      logger.error('❌ Delete folder failed', { error: error.message });
      throw error;
    }
  }



  /**
   * Move media to folder
   */
  async moveToFolder(mediaIds, brandId, targetFolder) {
    try {
      const result = await Media.updateMany(
        {
          _id: { $in: mediaIds },
          brand: brandId,
          status: 'active',
        },
        {
          $set: { folder: targetFolder },
        }
      );

      logger.info('✅ Media moved to folder', {
        folder: targetFolder,
        count: result.modifiedCount,
      });

      return { success: true, moved: result.modifiedCount };
    } catch (error) {
      logger.error('❌ Move to folder failed', { error: error.message });
      throw error;
    }
  }

  // /**
  //  * Get folders with metadata (UPDATED)
  //  */
  // async getFoldersMetadata(brandId) {
  //   try {
  //     // Get all folders from Folder collection
  //     const folders = await Folder.find({
  //       brand: brandId,
  //     }).sort({ name: 1 });

  //     // Get media counts grouped by folder
  //     const mediaCounts = await Media.aggregate([
  //       {
  //         $match: {
  //           brand: new mongoose.Types.ObjectId(brandId),
  //           status: 'active',
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: '$folder',
  //           mediaCount: { $sum: 1 },
  //           totalSize: { $sum: '$size' },
  //           lastUpdated: { $max: '$updatedAt' },
  //         },
  //       },
  //     ]);

  //     // Convert to map for easy lookup
  //     const countsMap = {};
  //     mediaCounts.forEach(item => {
  //       countsMap[item._id] = {
  //         mediaCount: item.mediaCount,
  //         totalSize: item.totalSize,
  //         lastUpdated: item.lastUpdated,
  //       };
  //     });

  //     // Include "Default" folder even if not in Folder collection
  //     const allFolders = [
  //       {
  //         name: 'Default',
  //         description: 'Default folder for uploads',
  //         color: '#6b7280',
  //         createdAt: new Date(),
  //       },
  //       ...folders.map(f => ({
  //         name: f.name,
  //         description: f.description,
  //         color: f.color,
  //         createdAt: f.createdAt,
  //       })),
  //     ];

  //     const result = allFolders.map(folder => ({
  //       name: folder.name,
  //       description: folder.description,
  //       color: folder.color,
  //       mediaCount: countsMap[folder.name]?.mediaCount || 0,
  //       totalSize: countsMap[folder.name]?.totalSize || 0,
  //       totalSizeFormatted: this.formatBytes(countsMap[folder.name]?.totalSize || 0),
  //       lastUpdated: countsMap[folder.name]?.lastUpdated || folder.createdAt,
  //       createdAt: folder.createdAt,
  //     }));

  //     return result;
  //   } catch (error) {
  //     logger.error('❌ Get folders with metadata failed', { error: error.message });
  //     throw error;
  //   }
  // }

  /**
   * Get folders with metadata (Fixed to show ghost folders)
   */
  async getFoldersMetadata(brandId) {
    try {
      // 1. Get stats for ALL folders currently used in Media collection
      const mediaCounts = await Media.aggregate([
        {
          $match: {
            brand: new mongoose.Types.ObjectId(brandId),
            status: 'active',
          },
        },
        {
          $group: {
            _id: '$folder',
            mediaCount: { $sum: 1 },
            totalSize: { $sum: '$size' },
            lastUpdated: { $max: '$updatedAt' },
          },
        },
      ]);

      // 2. Get explicitly defined folders
      const folders = await Folder.find({ brand: brandId }).lean();
      
      // 3. Merge them map
      const folderMap = {};
      
      // Initialize with explicit folders
      folders.forEach(f => {
        folderMap[f.name] = {
          name: f.name,
          description: f.description,
          color: f.color,
          mediaCount: 0,
          totalSize: 0,
          totalSizeFormatted: '0 B',
          createdAt: f.createdAt
        };
      });

      // Initialize Default if missing
      if (!folderMap['Default']) {
        folderMap['Default'] = {
          name: 'Default',
          description: 'Default folder',
          color: '#6b7280',
          mediaCount: 0,
          totalSize: 0,
          totalSizeFormatted: '0 B',
          createdAt: new Date()
        };
      }

      // Merge real counts (This discovers the "ghost" folders)
      mediaCounts.forEach(stat => {
        const name = stat._id || 'Default';
        if (!folderMap[name]) {
            // Found a ghost folder (like 'posts')! Create an entry for it.
            folderMap[name] = {
                name: name,
                description: 'Auto-detected folder',
                color: '#f59e0b', // Give it a warning color
                createdAt: new Date()
            };
        }
        folderMap[name].mediaCount = stat.mediaCount;
        folderMap[name].totalSize = stat.totalSize;
        folderMap[name].totalSizeFormatted = this.formatBytes(stat.totalSize);
      });

      return Object.values(folderMap);
    } catch (error) {
      logger.error('❌ Get folders metadata failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = new MediaService();

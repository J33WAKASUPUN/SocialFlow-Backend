const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');
const fs = require('fs').promises;

class CloudinaryService {
  /**
   * Upload video to Cloudinary with Instagram-optimized transformations
   */
  async uploadInstagramVideo(filePath, options = {}) {
  try {
    logger.info('📤 Uploading video to Cloudinary', { filePath });

    const uploadResult = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      folder: process.env.CLOUDINARY_FOLDER || 'social-media-videos',
      
      // ✅ STRONGER INSTAGRAM TRANSFORMATIONS
      transformation: [
        {
          width: 720,                   // ✅ REDUCED from 1280
          height: 720,                  // ✅ SQUARE format (safer)
          crop: 'pad',                  // ✅ PAD instead of LIMIT (adds black bars if needed)
          background: 'black',          // ✅ BLACK background for padding
          quality: 'auto:best',         // ✅ BEST quality
          video_codec: 'h264',          // ✅ Force H.264
          audio_codec: 'aac',           // ✅ Force AAC
          bit_rate: '3000k',            // ✅ REDUCED from 4000k to 3000k
          fps: '30',                    // ✅ Constant 30 FPS
          video_sampling: 30,           // ✅ ADDED: Sample every 30 frames
          flags: 'lossy',               // ✅ ADDED: Allow lossy compression
        }
      ],
      
      // ✅ EAGER TRANSFORMATION (process immediately)
      eager: [
        {
          width: 720,
          height: 720,
          crop: 'pad',
          background: 'black',
          quality: 'auto:best',
          format: 'mp4',
          video_codec: 'h264',
          audio_codec: 'aac',
          bit_rate: '3000k',
          fps: '30',
        }
      ],
      eager_async: false, // ✅ Wait for transformation to complete
      
      // Metadata
      public_id: options.publicId || undefined,
      overwrite: options.overwrite || false,
      tags: ['instagram', 'social-media', ...(options.tags || [])],
    });

    logger.info('✅ Video uploaded to Cloudinary', {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      duration: uploadResult.duration,
      format: uploadResult.format,
      size: `${(uploadResult.bytes / 1024 / 1024).toFixed(2)}MB`,
      width: uploadResult.width,
      height: uploadResult.height,
      bitRate: uploadResult.bit_rate,
      videoCodec: uploadResult.video?.codec,
      audioCodec: uploadResult.audio?.codec,
    });

    // Delete local file after successful upload
    try {
      await fs.unlink(filePath);
      logger.info('🗑️ Deleted local file after upload', { filePath });
    } catch (unlinkError) {
      logger.warn('⚠️ Failed to delete local file', { filePath, error: unlinkError.message });
    }

    return {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      duration: uploadResult.duration,
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height,
      size: uploadResult.bytes,
      bitRate: uploadResult.bit_rate,
      videoCodec: uploadResult.video?.codec,
      audioCodec: uploadResult.audio?.codec,
      createdAt: uploadResult.created_at,
    };
  } catch (error) {
    logger.error('❌ Cloudinary upload failed', {
      error: error.message,
      filePath,
    });

    throw new Error(`Cloudinary upload failed: ${error.message}`);
  }
}

  /**
   * Upload image to Cloudinary
   */
  async uploadImage(filePath, options = {}) {
    try {
      logger.info('📤 Uploading image to Cloudinary', { filePath });

      const uploadResult = await cloudinary.uploader.upload(filePath, {
        resource_type: 'image',
        folder: options.folder || process.env.CLOUDINARY_FOLDER || 'social-media-images',
        transformation: [
          {
            width: 1920,
            height: 1080,
            crop: 'limit',
            quality: 'auto:good',
          }
        ],
        public_id: options.publicId || options.public_id || undefined,
        overwrite: options.overwrite || false,
        tags: ['social-media', ...(options.tags || [])],
      });

      logger.info('✅ Image uploaded to Cloudinary', {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      });

      // Delete local file
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        logger.warn('⚠️ Failed to delete local image', { filePath });
      }

      return {
        url: uploadResult.secure_url,
        secure_url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        format: uploadResult.format,
        width: uploadResult.width,
        height: uploadResult.height,
        size: uploadResult.bytes,
      };
    } catch (error) {
      logger.error('❌ Cloudinary image upload failed', {
        error: error.message,
        filePath,
      });

      throw new Error(`Cloudinary image upload failed: ${error.message}`);
    }
  }

  /**
   * Delete file from Cloudinary
   */
  async deleteFile(publicId, resourceType = 'video') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });

      logger.info('🗑️ File deleted from Cloudinary', { publicId, result });

      return result;
    } catch (error) {
      logger.error('❌ Cloudinary deletion failed', {
        error: error.message,
        publicId,
      });

      throw new Error(`Cloudinary deletion failed: ${error.message}`);
    }
  }

  /**
   * Get video info from Cloudinary
   */
  async getVideoInfo(publicId) {
    try {
      const result = await cloudinary.api.resource(publicId, {
        resource_type: 'video',
      });

      return {
        url: result.secure_url,
        duration: result.duration,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        createdAt: result.created_at,
      };
    } catch (error) {
      logger.error('❌ Failed to get video info', {
        error: error.message,
        publicId,
      });

      throw new Error(`Failed to get video info: ${error.message}`);
    }
  }
}

module.exports = new CloudinaryService();
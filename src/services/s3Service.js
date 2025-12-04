const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

class S3Service {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    this.bucketName = process.env.AWS_S3_BUCKET_NAME;
    this.mediaFolder = process.env.AWS_S3_MEDIA_FOLDER || 'media';
    this.avatarsFolder = process.env.AWS_S3_AVATARS_FOLDER || 'avatars';
    this.thumbnailsFolder = process.env.AWS_S3_THUMBNAILS_FOLDER || 'thumbnails';

    logger.info('✅ AWS S3 Service initialized', {
      region: process.env.AWS_REGION,
      bucket: this.bucketName,
    });
  }

  /**
   * Generate unique filename
   */
  generateFileName(originalName, prefix = '') {
    const ext = path.extname(originalName);
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${prefix}${timestamp}-${uniqueId}${ext}`;
  }

  /**
   * Sanitize metadata for S3
   * S3 metadata MUST be HTTP-header compatible (string values only, no special chars)
   */
  sanitizeMetadata(metadata) {
    const sanitized = {};
    
    if (!metadata || typeof metadata !== 'object') {
      return sanitized;
    }

    for (const [key, value] of Object.entries(metadata)) {
      // Skip null, undefined, empty values
      if (value === null || value === undefined || value === '') {
        continue;
      }

      try {
        // Convert everything to string first
        let stringValue = String(value);
        
        // Remove any characters that could break HTTP headers
        // Keep only: letters, numbers, spaces, hyphens, underscores, periods, colons
        stringValue = stringValue
          .replace(/[^a-zA-Z0-9\s\-_.:/]/g, '')
          .trim();
        
        // Skip if empty after sanitization
        if (stringValue.length === 0) {
          continue;
        }

        // S3 metadata keys must be lowercase and use hyphens
        const sanitizedKey = key
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
        
        if (sanitizedKey.length > 0) {
          sanitized[sanitizedKey] = stringValue;
        }
      } catch (err) {
        logger.warn('⚠️ Failed to sanitize metadata key', { 
          key, 
          value: String(value).substring(0, 50),
          error: err.message 
        });
      }
    }
    
    return sanitized;
  }

  /**
   * Upload file to S3
   * @param {string} filePath - Local file path
   * @param {string} folder - S3 folder (media/avatars/thumbnails)
   * @param {object} metadata - Additional metadata (will be sanitized)
   * @returns {object} - Upload result with S3 URL
   */
  async uploadFile(filePath, folder, metadata = {}) {
    let fileContent;
    
    try {
      // Read file
      fileContent = await fs.readFile(filePath);
      const originalName = path.basename(filePath);
      const fileName = this.generateFileName(originalName);
      
      // Determine content type
      const ext = path.extname(originalName).toLowerCase();
      const contentType = this.getContentType(ext);

      // S3 key (path in bucket)
      const key = `${folder}/${fileName}`;

      // Prepare metadata
      const rawMetadata = {
        'original-name': originalName,
        'uploaded-at': new Date().toISOString(),
        ...metadata,
      };
      
      const sanitizedMetadata = this.sanitizeMetadata(rawMetadata);
      
      logger.info('📤 Uploading to S3', {
        originalName,
        key,
        size: `${(fileContent.length / 1024 / 1024).toFixed(2)}MB`,
        contentType,
        metadata: sanitizedMetadata,
      });

      // Create upload command
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        Metadata: sanitizedMetadata,
      });

      // Upload to S3
      await this.s3Client.send(command);

      // Generate public URL
      const url = this.getPublicUrl(key);

      logger.info('✅ File uploaded to S3', {
        originalName,
        fileName,
        key,
        url,
      });

      // Clean up local file
      try {
        await fs.unlink(filePath);
        logger.info('🗑️ Local file deleted', { filePath });
      } catch (unlinkError) {
        logger.warn('⚠️ Failed to delete local file', { 
          filePath, 
          error: unlinkError.message 
        });
      }

      return {
        success: true,
        url,
        key,
        fileName,
        originalName,
        size: fileContent.length,
        contentType,
        bucket: this.bucketName,
      };
      
    } catch (error) {
      logger.error('❌ S3 upload failed', {
        filePath,
        error: error.message,
        errorName: error.name,
        stack: error.stack,
      });
      
      // Don't throw the raw error, wrap it with more context
      const enhancedError = new Error(`S3 upload failed: ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.filePath = filePath;
      
      throw enhancedError;
    }
  }

  /**
   * Upload image to S3
   */
  async uploadImage(filePath, metadata = {}) {
    return await this.uploadFile(filePath, this.mediaFolder, {
      type: 'image',
      ...metadata,
    });
  }

  /**
   * Upload video to S3
   */
  async uploadVideo(filePath, metadata = {}) {
    return await this.uploadFile(filePath, this.mediaFolder, {
      type: 'video',
      ...metadata,
    });
  }

  /**
   * Upload avatar to S3
   */
  async uploadAvatar(filePath, userId) {
    return await this.uploadFile(filePath, this.avatarsFolder, {
      type: 'avatar',
      userId: String(userId),
    });
  }

  /**
   * Upload thumbnail to S3
   */
  async uploadThumbnail(filePath, metadata = {}) {
    return await this.uploadFile(filePath, this.thumbnailsFolder, {
      type: 'thumbnail',
      ...metadata,
    });
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);

      logger.info('🗑️ File deleted from S3', { key });

      return { success: true };
    } catch (error) {
      logger.error('❌ S3 delete failed', {
        key,
        error: error.message,
      });
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  /**
   * Generate presigned URL for temporary access
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      return url;
    } catch (error) {
      logger.error('❌ Failed to generate presigned URL', {
        key,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get public URL for S3 object
   */
  getPublicUrl(key) {
    // If CloudFront is configured, use it
    if (process.env.AWS_CLOUDFRONT_URL) {
      return `${process.env.AWS_CLOUDFRONT_URL}/${key}`;
    }

    // Otherwise, use direct S3 URL
    return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  /**
   * Get content type from file extension
   */
  getContentType(ext) {
    const contentTypes = {
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      
      // Videos
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      
      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Test S3 connection
   */
  async testConnection() {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1,
      });

      await this.s3Client.send(command);

      logger.info('✅ S3 connection test successful');
      return true;
    } catch (error) {
      logger.error('❌ S3 connection test failed', {
        error: error.message,
        bucket: this.bucketName,
        region: process.env.AWS_REGION,
      });
      return false;
    }
  }
}

module.exports = new S3Service();
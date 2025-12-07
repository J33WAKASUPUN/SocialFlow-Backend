const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Environment Variables Schema
 */
const envSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  APP_NAME: Joi.string().default('Social Media Marketing Platform'),
  APP_PORT: Joi.number().default(5000),
  APP_URL: Joi.string().default('http://localhost:5000'),
  CLIENT_URL: Joi.string().default('http://localhost:5173'),

  // MongoDB
  MONGODB_URI: Joi.string().required(),
  MONGODB_DB_NAME: Joi.string().default('social_media_platform'),

  // Redis
  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB_CACHE: Joi.number().default(0),
  REDIS_DB_SESSION: Joi.number().default(1),
  REDIS_DB_QUEUE: Joi.number().default(2),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('2h'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Google OAuth
  GOOGLE_AUTH_CLIENT_ID: Joi.string().required(),
  GOOGLE_AUTH_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().required(),

  // Session
  SESSION_SECRET: Joi.string().min(32).required(),
  SESSION_LIFETIME: Joi.number().default(7200000),
  SESSION_SECURE: Joi.boolean().default(false),

  // File Upload
  UPLOAD_DIR: Joi.string().default('uploads'),
  MAX_FILE_SIZE: Joi.number().default(10485760),
  ALLOWED_IMAGE_TYPES: Joi.string().default('image/jpeg,image/png,image/gif,image/webp'),
  ALLOWED_VIDEO_TYPES: Joi.string().default('video/mp4,video/mpeg,video/quicktime'),

  // Email
  MAIL_HOST: Joi.string().required(),
  MAIL_PORT: Joi.number().required(),
  MAIL_SECURE: Joi.boolean().default(false),
  MAIL_USER: Joi.string().required(),
  MAIL_PASSWORD: Joi.string().required(),
  MAIL_FROM_ADDRESS: Joi.string().email().required(),
  MAIL_FROM_NAME: Joi.string().default('Social Media Marketing Platform'),

  // Encryption
  ENCRYPTION_KEY: Joi.string().length(64).required(),
  ENCRYPTION_ALGORITHM: Joi.string().default('aes-256-gcm'),

  // LinkedIn OAuth
  LINKEDIN_CLIENT_ID: Joi.string().optional(),
  LINKEDIN_CLIENT_SECRET: Joi.string().optional(),
  LINKEDIN_CALLBACK_URL: Joi.string().optional(),

  // Facebook OAuth
  FACEBOOK_APP_ID: Joi.string().optional(),
  FACEBOOK_APP_SECRET: Joi.string().optional(),
  FACEBOOK_CALLBACK_URL: Joi.string().optional(),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),
  CLOUDINARY_FOLDER: Joi.string().default('social-media-videos'),

  // AWS S3 Configuration
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_REGION: Joi.string().default('us-east-1'),
  AWS_S3_BUCKET_NAME: Joi.string().required(),
  AWS_S3_MEDIA_FOLDER: Joi.string().default('media'),
  AWS_S3_AVATARS_FOLDER: Joi.string().default('avatars'),
  AWS_S3_THUMBNAILS_FOLDER: Joi.string().default('thumbnails'),

  // YouTube OAuth
  YOUTUBE_CLIENT_ID: Joi.string().optional(),
  YOUTUBE_CLIENT_SECRET: Joi.string().optional(),
  YOUTUBE_CALLBACK_URL: Joi.string().optional(),
  YOUTUBE_API_KEY: Joi.string().optional(),
  YOUTUBE_SCOPES: Joi.string().default(
    'https://www.googleapis.com/auth/youtube.upload,' +
    'https://www.googleapis.com/auth/youtube,' +
    'https://www.googleapis.com/auth/youtube.readonly'
  ),
  
  // YouTube Settings
  YOUTUBE_DEFAULT_CATEGORY: Joi.number().default(22),
  YOUTUBE_DEFAULT_PRIVACY: Joi.string().valid('public', 'unlisted', 'private').default('private'),
  YOUTUBE_MAX_FILE_SIZE_MB: Joi.number().default(2048),
}).unknown(true);

/**
 * Validate Environment Variables
 */
function validateEnv() {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const missingVars = error.details.map(detail => detail.path.join('.'));
    logger.error('❌ Environment validation failed:', {
      missingVariables: missingVars,
      errors: error.details.map(d => d.message),
    });
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  logger.info('✅ Environment variables validated successfully');
  return value;
}

module.exports = { validateEnv };
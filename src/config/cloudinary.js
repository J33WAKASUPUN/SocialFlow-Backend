const cloudinary = require('cloudinary').v2;
const logger = require('../utils/logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Test connection
const testConnection = async () => {
  try {
    const result = await cloudinary.api.ping();
    logger.info('✅ Cloudinary connected successfully', result);
    return true;
  } catch (error) {
    logger.error('❌ Cloudinary connection failed:', error.message);
    return false;
  }
};

// Test on startup
testConnection();

module.exports = cloudinary;
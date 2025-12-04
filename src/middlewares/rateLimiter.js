const rateLimit = require('express-rate-limit');
const redisClient = require('../config/redis');

// API rate limiter (in-memory) - INCREASED FOR DEVELOPMENT
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to 1000 for development
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth rate limiter - INCREASED FOR DEVELOPMENT
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased from 30 to 100 for development
  message: {
    success: false,
    message: 'Too many login attempts, please try again later.',
  },
});

// Publishing rate limiter
const publishLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: {
    success: false,
    message: 'Publishing rate limit exceeded.',
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
  publishLimiter,
};
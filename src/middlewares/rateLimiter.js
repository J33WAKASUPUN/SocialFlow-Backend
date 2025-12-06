const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redisClient = require('../config/redis');

// Use Redis-backed rate limiting for distributed environments
const createRateLimiter = (windowMs, max, message) => {
  const config = {
    windowMs,
    max,
    message: {
      success: false,
      message,
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for successful requests to health checks
    skip: (req) => req.path === '/health' || req.path === '/ping',
  };

  // Use Redis store if available (for load-balanced environments)
  if (process.env.NODE_ENV === 'production' && redisClient.getCache()?.isOpen) {
    config.store = new RedisStore({
      client: redisClient.getCache(),
      prefix: 'rl:',
    });
  }

  return rateLimit(config);
};

// API rate limiter - STRICTER LIMITS
const apiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  process.env.NODE_ENV === 'production' ? 100 : 1000, // 100 in prod, 1000 in dev
  'Too many requests, please try again later.'
);

// Auth rate limiter - MUCH STRICTER
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  process.env.NODE_ENV === 'production' ? 5 : 100, // Only 5 login attempts in prod
  'Too many authentication attempts. Please try again in 15 minutes.'
);

// Publishing rate limiter - PER USER
const publishLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  50, // Max 50 posts per hour
  'Publishing rate limit exceeded. Please wait before posting again.'
);

// Forgot password rate limiter
const forgotPasswordLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  3, // Only 3 attempts per hour
  'Too many password reset requests. Please try again later.'
);

// 2FA verification rate limiter
const twoFactorLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  10, // Max 10 2FA attempts
  'Too many verification attempts. Please try again later.'
);

module.exports = {
  apiLimiter,
  authLimiter,
  publishLimiter,
  forgotPasswordLimiter,
  twoFactorLimiter,
};
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const redisClient = require('../config/redis');

const signAsync = promisify(jwt.sign);
const verifyAsync = promisify(jwt.verify);

/**
 * Generate Access Token
 */
const generateAccessToken = async (userId) => {
  return await signAsync(
    { userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );
};

/**
 * Generate Refresh Token
 */
const generateRefreshToken = async (userId) => {
  return await signAsync(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

/**
 * Verify Token
 */
const verifyToken = async (token, isRefreshToken = false) => {
  try {
    const secret = isRefreshToken ? process.env.JWT_REFRESH_SECRET : process.env.JWT_SECRET;
    const decoded = await verifyAsync(token, secret);
    
    // Check if token is blacklisted
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new Error('Token has been revoked');
    }
    
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Blacklist Token (for logout)
 */
const blacklistToken = async (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return false;
    }
    
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      const cacheClient = redisClient.getCache();
      await cacheClient.setEx(`blacklist:${token}`, ttl, 'true');
    }
    
    return true;
  } catch (error) {
    console.error('Error blacklisting token:', error);
    return false;
  }
};

/**
 * Check if Token is Blacklisted
 */
const isTokenBlacklisted = async (token) => {
  try {
    const cacheClient = redisClient.getCache();
    const result = await cacheClient.get(`blacklist:${token}`);
  } catch (error) {
    console.error('Error checking token blacklist:', error);
    return false;
  }
};

/**
 * Generate Both Tokens
 */
const generateTokenPair = async (userId) => {
  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(userId),
    generateRefreshToken(userId),
  ]);
  
  return { accessToken, refreshToken };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  blacklistToken,
  isTokenBlacklisted,
  generateTokenPair,
};
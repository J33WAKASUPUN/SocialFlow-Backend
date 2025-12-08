const logger = require('../utils/logger');
const encryptionService = require('../services/encryptionService');

/**
 * Abstract Base Provider
 * All social media providers must extend this class
 */
class BaseProvider {
  constructor(channel = null) {
    this.channel = channel;
    this.provider = this.constructor.name.replace('Provider', '').toLowerCase();
  }

  /**
   * Get provider configuration
   * Must be implemented by child classes
   */
  getConfig() {
    throw new Error('getConfig() must be implemented');
  }

  /**
   * Get OAuth authorization URL
   * Must be implemented by child classes
   */
  getAuthorizationUrl(state) {
    throw new Error('getAuthorizationUrl() must be implemented');
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   * Must be implemented by child classes
   */
  async handleCallback(code, state) {
    throw new Error('handleCallback() must be implemented');
  }

  /**
   * Refresh access token
   * Must be implemented by child classes
   */
  async refreshAccessToken() {
    throw new Error('refreshAccessToken() must be implemented');
  }

  /**
   * Test connection validity
   * Must be implemented by child classes
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented');
  }

  /**
   * Publish post to platform
   * Must be implemented by child classes
   */
  async publish(post) {
    throw new Error('publish() must be implemented');
  }

  /**
   * Get post analytics (if supported)
   * Must be implemented by child classes
   */
  async getPostAnalytics(platformPostId) {
    throw new Error('getPostAnalytics() must be implemented');
  }

/**
 * Get decrypted access token
 */
getAccessToken() {
  if (!this.channel || !this.channel.accessToken) {
    throw new Error('No access token available');
  }
  
  return this.channel.accessToken;
}

/**
 * Get decrypted refresh token
 */
getRefreshToken() {
  if (!this.channel || !this.channel.refreshToken) {
    return null;
  }
  
  return this.channel.refreshToken;
}

  /**
   * Check if token is expired
   */
  isTokenExpired() {
    if (!this.channel || !this.channel.tokenExpiresAt) {
      return false;
    }
    
    return new Date() >= this.channel.tokenExpiresAt;
  }

  /**
   * Log provider action
   */
  log(action, data = {}) {
    logger.info(`[${this.provider.toUpperCase()}] ${action}`, data);
  }

  /**
   * Log provider error
   */
  logError(action, error) {
    logger.error(`[${this.provider.toUpperCase()}] ${action}:`, error);
  }
}

module.exports = BaseProvider;
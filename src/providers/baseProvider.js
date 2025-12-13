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
   * Get decrypted access token with proper error handling
   */
  getAccessToken() {
    if (!this.channel || !this.channel.accessToken) {
      throw new Error('No access token available');
    }
    
    const token = this.channel.accessToken;
    
    // If token looks encrypted, decrypt it manually
    if (typeof token === 'string' && token.includes(':') && token.split(':').length === 3) {
      try {
        const decrypted = encryptionService.decrypt(token);
        this.log('Token decrypted manually', { 
          tokenLength: decrypted.length,
          tokenPreview: decrypted.substring(0, 20) + '...'
        });
        return decrypted;
      } catch (error) {
        this.logError('Token decryption failed', error);
        throw new Error('Failed to decrypt access token');
      }
    }
    
    // Token should be a string and not look encrypted
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid access token format');
    }

    // Token should be reasonably long (Facebook tokens are 100+ chars)
    if (token.length < 20) {
      throw new Error('Access token too short - possibly corrupted');
    }

    return token;
  }

  /**
   * Get decrypted refresh token with proper error handling
   */
  getRefreshToken() {
    if (!this.channel || !this.channel.refreshToken) {
      return null;
    }
    
    const token = this.channel.refreshToken;
    
    // If token looks encrypted, decrypt it manually
    if (typeof token === 'string' && token.includes(':') && token.split(':').length === 3) {
      try {
        return encryptionService.decrypt(token);
      } catch (error) {
        this.logError('Refresh token decryption failed', error);
        return null;
      }
    }
    
    return token;
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
    logger.error(`[${this.provider.toUpperCase()}] ${action}:`, {
      message: error.message,
      stack: error.stack,
    });
  }
}

module.exports = BaseProvider;
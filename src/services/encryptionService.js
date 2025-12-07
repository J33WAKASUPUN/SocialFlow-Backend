const crypto = require('crypto');
const logger = require('../utils/logger');

class EncryptionService {
  constructor() {
    this.algorithm = process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm';
    this.key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
  }

  /**
   * Encrypt text using AES-256-GCM
   */
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Return IV:AuthTag:EncryptedData
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error('Encryption error:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt encrypted text
   */
  decrypt(encryptedData) {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption error:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt OAuth tokens for storage
   */
  encryptTokens(tokens) {
    return {
      accessToken: this.encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? this.encrypt(tokens.refreshToken) : null,
    };
  }

  /**
   * Decrypt OAuth tokens from storage
   */
  decryptTokens(encryptedTokens) {
    return {
      accessToken: this.decrypt(encryptedTokens.accessToken),
      refreshToken: encryptedTokens.refreshToken ? this.decrypt(encryptedTokens.refreshToken) : null,
    };
  }
}

module.exports = new EncryptionService();
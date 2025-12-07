const mongoose = require('mongoose');
const encryptionService = require('../services/encryptionService');

const channelSchema = new mongoose.Schema({
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
  },
  provider: {
    type: String,
    enum: ['linkedin', 'facebook', 'instagram', 'twitter', 'youtube'],
    required: true,
  },
  
  // Platform Account Info
  platformUserId: {
    type: String,
    required: true,
  },
  platformUsername: {
    type: String,
  },
  displayName: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
  },
  profileUrl: {
    type: String,
  },
  
  // Store encrypted tokens
  accessToken: {
    type: String,
    required: true,
    set: (token) => {
      // Encrypt before saving
      try {
        return encryptionService.encrypt(token);
      } catch (error) {
        console.error('Token encryption failed:', error);
        return token; // Fallback (should be handled better)
      }
    },
    get: (encryptedToken) => {
      // Decrypt when reading
      if (!encryptedToken) return null;
      try {
        return encryptionService.decrypt(encryptedToken);
      } catch (error) {
        console.error('Token decryption failed:', error);
        return null;
      }
    }
  },
  
  refreshToken: {
    type: String,
    set: (token) => {
      if (!token) return null;
      try {
        return encryptionService.encrypt(token);
      } catch (error) {
        console.error('Token encryption failed:', error);
        return token;
      }
    },
    get: (encryptedToken) => {
      if (!encryptedToken) return null;
      try {
        return encryptionService.decrypt(encryptedToken);
      } catch (error) {
        console.error('Token decryption failed:', error);
        return null;
      }
    }
  },
  
  tokenExpiresAt: {
    type: Date,
  },
  scopes: [{
    type: String,
  }],
  connectionStatus: {
    type: String,
    enum: ['active', 'expired', 'error', 'disconnected'],
    default: 'active',
  },
  lastHealthCheck: {
    type: Date,
  },
  healthCheckError: {
    type: String,
  },
  providerData: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  connectedAt: {
    type: Date,
    default: Date.now,
  },
  connectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
  // Enable getters for encrypted fields
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Compound index for uniqueness
channelSchema.index({ brand: 1, provider: 1, platformUserId: 1 }, { unique: true });

// Test connection health
channelSchema.methods.testConnection = async function() {
  const ProviderFactory = require('../providers/ProviderFactory');
  try {
    const provider = ProviderFactory.getProvider(this.provider, this);
    const isValid = await provider.testConnection();
    
    this.lastHealthCheck = new Date();
    this.connectionStatus = isValid ? 'active' : 'error';
    this.healthCheckError = isValid ? null : 'Connection test failed';
    
    await this.save();
    return isValid;
  } catch (error) {
    this.lastHealthCheck = new Date();
    this.connectionStatus = 'error';
    this.healthCheckError = error.message;
    await this.save();
    return false;
  }
};

// Check if token is expired
channelSchema.methods.isTokenExpired = function() {
  if (!this.tokenExpiresAt) return false;
  return new Date() > this.tokenExpiresAt;
};

module.exports = mongoose.model('Channel', channelSchema);
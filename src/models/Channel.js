const mongoose = require('mongoose');

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
  
  // Encrypted OAuth Tokens
  accessToken: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
  },
  tokenExpiresAt: {
    type: Date,
  },
  
  // OAuth Metadata
  scopes: [{
    type: String,
  }],
  
  // Connection Status
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
  
  // Platform-Specific Data
  providerData: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  
  // Metadata
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
});

// Compound index for uniqueness
channelSchema.index({ brand: 1, provider: 1, platformUserId: 1 }, { unique: true });

// Test connection health
channelSchema.methods.testConnection = async function() {
  const ProviderFactory = require('../providers/ProviderFactory');
  const provider = ProviderFactory.getProvider(this.provider, this);
  
  try {
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
  return new Date() >= this.tokenExpiresAt;
};

module.exports = mongoose.model('Channel', channelSchema);
const mongoose = require('mongoose');

const whatsappAccountHealthSchema = new mongoose.Schema({
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
    unique: true, // One health record per channel
  },
  phoneNumberId: {
    type: String,
    required: true,
    index: true,
  },
  qualityRating: {
    type: String,
    enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'],
    default: 'UNKNOWN',
  },
  messagingLimit: {
    type: String,
    enum: ['TIER_NOT_SET', 'TIER_50', 'TIER_250', 'TIER_1K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED'],
    default: 'TIER_NOT_SET',
  },
  qualityScore: {
    type: Number, // 0-100
    min: 0,
    max: 100,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true,
  },
  // Historical quality updates
  history: [{
    qualityRating: String,
    messagingLimit: String,
    timestamp: Date,
    reason: String, // Why quality changed
  }],
  // Alerts
  alerts: [{
    type: {
      type: String,
      enum: ['QUALITY_DEGRADED', 'LIMIT_REACHED', 'ACCOUNT_RESTRICTED'],
    },
    message: String,
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
    },
    acknowledged: {
      type: Boolean,
      default: false,
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
}, {
  timestamps: true,
});

module.exports = mongoose.model('WhatsAppAccountHealth', whatsappAccountHealthSchema);
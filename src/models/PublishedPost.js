const mongoose = require('mongoose');

const publishedPostSchema = new mongoose.Schema({
  // Ownership
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
    index: true,
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
    index: true,
  },
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Platform Info
  provider: {
    type: String,
    enum: ['linkedin', 'facebook', 'instagram', 'twitter', 'youtube'],
    required: true,
    index: true,
  },
  platformPostId: {
    type: String,
    required: true,
    index: true,
  },
  platformUrl: {
    type: String,
  },

  // Content
  title: {
    type: String,
  },
  content: {
    type: String,
    required: true,
  },
  mediaUrls: [{
    type: String,
  }],
  mediaType: {
    type: String,
    enum: ['none', 'image', 'video', 'short', 'multiImage', 'carousel', 'article'],
    default: 'none',
  },

  // Publishing Status
  status: {
    type: String,
    enum: ['published', 'updated', 'deleted', 'failed'],
    default: 'published',
    index: true,
  },
  publishedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
  },
  deletedAt: {
    type: Date,
  },

  // Analytics (optional - sync from platform APIs)
  analytics: {
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    lastSyncedAt: { type: Date },
  },

  // Metadata
  error: {
    type: String,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
publishedPostSchema.index({ brand: 1, publishedAt: -1 });
publishedPostSchema.index({ channel: 1, status: 1 });
publishedPostSchema.index({ provider: 1, platformPostId: 1 }, { unique: true });

// Soft delete
publishedPostSchema.methods.softDelete = function() {
  this.status = 'deleted';
  this.deletedAt = new Date();
  return this.save();
};

// Update analytics
publishedPostSchema.methods.updateAnalytics = function(data) {
  this.analytics = {
    ...this.analytics,
    ...data,
    lastSyncedAt: new Date(),
  };
  return this.save();
};

module.exports = mongoose.model('PublishedPost', publishedPostSchema);
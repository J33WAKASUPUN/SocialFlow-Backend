const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  // Ownership
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Content
  title: {
    type: String,
    maxlength: 200,
  },
  content: {
    type: String,
    required: true,
    maxlength: 10000,
  },
  hashtags: {
    type: [String],
    default: [],
  },
  mediaUrls: [{
    type: String,
  }],
  mediaType: {
    type: String,
    enum: ['none', 'image', 'video', 'carousel', 'multiImage'],
    default: 'none',
  },
  mediaLibraryItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
  }],

  // Scheduling per channel
  schedules: [{
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
    },
    provider: {
      type: String,
      enum: ['linkedin', 'facebook', 'instagram', 'twitter', 'youtube'],
      required: true,
    },
    scheduledFor: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'queued', 'published', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    publishedAt: Date,
    platformPostId: String,
    error: String,
    retryCount: {
      type: Number,
      default: 0,
    },
    jobId: String, // Bull queue job ID
  }],

  // Post Status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'publishing', 'published', 'failed'],
    default: 'draft',
    index: true,
  },

  // Settings
  settings: {
    requireApproval: {
      type: Boolean,
      default: false,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    notifyOnPublish: {
      type: Boolean,
      default: true,
    },
  },

  // Metadata
  publishedCount: {
    type: Number,
    default: 0,
  },
  failedCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

// Indexes
postSchema.index({ brand: 1, status: 1 });
postSchema.index({ createdBy: 1, createdAt: -1 });
postSchema.index({ 'schedules.scheduledFor': 1, 'schedules.status': 1 });

// Virtual for all published posts
postSchema.virtual('publishedPosts', {
  ref: 'PublishedPost',
  localField: '_id',
  foreignField: 'post',
});

// Methods
postSchema.methods.isDue = function(scheduleId) {
  const schedule = this.schedules.id(scheduleId);
  if (!schedule) return false;
  return schedule.scheduledFor <= new Date() && schedule.status === 'pending';
};

postSchema.methods.hasSchedules = function() {
  return this.schedules && this.schedules.length > 0;
};

postSchema.methods.getPendingSchedules = function() {
  return this.schedules.filter(s => s.status === 'pending' && s.scheduledFor <= new Date());
};

module.exports = mongoose.model('Post', postSchema);
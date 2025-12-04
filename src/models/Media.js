const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  // Ownership
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
    index: true,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // File Information
  filename: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  size: {
    type: Number, // in bytes
    required: true,
  },
  
  // S3 Storage
  s3Key: {
    type: String,
    required: true,
    unique: true,
  },
  s3Url: {
    type: String,
    required: true,
  },
  s3Bucket: {
    type: String,
    required: true,
  },
  
  // Media Type
  type: {
    type: String,
    enum: ['image', 'video', 'document'],
    required: true,
    index: true,
  },
  
  // Media Metadata
  metadata: {
    type: {
      width: Number,
      height: Number,
      duration: Number,
      format: String,
      codec: String,
      bitrate: Number,
      fps: Number,
      aspectRatio: String,
      thumbnailUrl: String,
    },
    default: {},
  },

  // Organization
  folder: {
    type: String,
    default: 'Default',
    index: true,
  },
  tags: [{
    type: String,
    index: true,
  }],
  
  // SEO & Accessibility
  altText: {
    type: String,
    maxlength: 200,
  },
  caption: {
    type: String,
    maxlength: 500,
  },
  
  // Usage Tracking
  usageCount: {
    type: Number,
    default: 0,
  },
  lastUsedAt: {
    type: Date,
  },
  usedInPosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
  }],
  
  // Status
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active',
    index: true,
  },
  
}, {
  timestamps: true,
});

// Indexes for efficient queries
mediaSchema.index({ brand: 1, type: 1, status: 1 });
mediaSchema.index({ brand: 1, folder: 1, status: 1 });
mediaSchema.index({ brand: 1, tags: 1, status: 1 });
mediaSchema.index({ brand: 1, uploadedBy: 1 });
mediaSchema.index({ createdAt: -1 });

// Virtual: Get file extension
mediaSchema.virtual('extension').get(function() {
  return this.filename.split('.').pop().toLowerCase();
});

// Virtual: Get readable file size
mediaSchema.virtual('readableSize').get(function() {
  const bytes = this.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
});

// Method: Mark as used
mediaSchema.methods.markAsUsed = function(postId) {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  
  if (postId && !this.usedInPosts.includes(postId)) {
    this.usedInPosts.push(postId);
  }
  
  return this.save();
};

// Method: Soft delete
mediaSchema.methods.softDelete = function() {
  this.status = 'deleted';
  return this.save();
};

// Method: Archive
mediaSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

// Static: Get storage stats for a brand
mediaSchema.statics.getStorageStats = async function(brandId) {
  const stats = await this.aggregate([
    { $match: { brand: new mongoose.Types.ObjectId(brandId), status: 'active' } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalSize: { $sum: '$size' },
      },
    },
  ]);
  
  return stats;
};

module.exports = mongoose.model('Media', mediaSchema);
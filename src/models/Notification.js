const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Recipient
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    index: true,
  },

  // Notification Details
  type: {
    type: String,
    enum: [
      'post_published',      // Post published successfully
      'post_failed',         // Post publishing failed
      'post_scheduled',      // Post scheduled
      'channel_disconnected', // Social channel disconnected
      'channel_connected',   // Social channel connected
      'member_invited',      // Team member invited
      'member_joined',       // Team member joined
      'approval_required',   // Post needs approval
      'approval_granted',    // Post approved
      'approval_rejected',   // Post rejected
      'media_uploaded',      // Media uploaded to library
      'system',              // System notification
    ],
    required: true,
    index: true,
  },
  
  title: {
    type: String,
    required: true,
    maxlength: 200,
  },
  
  message: {
    type: String,
    required: true,
    maxlength: 1000,
  },

  // Contextual Data
  data: {
    postId: mongoose.Schema.Types.ObjectId,
    channelId: mongoose.Schema.Types.ObjectId,
    mediaId: mongoose.Schema.Types.ObjectId,
    platformName: String,
    platformPostId: String,
    platformUrl: String,
    error: String,
    // Add any other relevant data
  },

  // Action Link
  actionUrl: {
    type: String,
  },
  actionText: {
    type: String,
  },

  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true,
  },

  // Status
  read: {
    type: Boolean,
    default: false,
    index: true,
  },
  readAt: {
    type: Date,
  },

  // Metadata
  expiresAt: {
    type: Date,
    // index: true,
  },
  
}, {
  timestamps: true,
});

// Indexes for efficient queries
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, createdAt: -1 });
notificationSchema.index({ user: 1, brand: 1, read: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Method: Mark as read
notificationSchema.methods.markAsRead = function() {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

// Static: Get unread count
notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({ user: userId, read: false });
};

// Static: Mark all as read
notificationSchema.statics.markAllAsRead = async function(userId) {
  return await this.updateMany(
    { user: userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
};

module.exports = mongoose.model('Notification', notificationSchema);
const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: false,
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },
  role: {
    type: String,
    enum: ['owner', 'manager', 'editor', 'viewer'],
    default: 'viewer',
  },
  permissions: [{
    type: String,
    enum: [
      'manage_brand',
      'connect_channels',
      'create_posts',
      'publish_posts',
      'view_analytics',
      'view_posts',
      'view_media',
      'invite_members',
      'manage_members',
      'delete_brand',
    ],
  }],
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  invitedAt: {
    type: Date,
    default: Date.now,
  },
  acceptedAt: Date,
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended'],
    default: 'active',
  },
}, {
  timestamps: true,
});

// Compound index to allow organization-only memberships
membershipSchema.index({ user: 1, organization: 1 }, { unique: true, sparse: true });
membershipSchema.index({ user: 1, brand: 1 }, { unique: true, sparse: true });

// Set default permissions based on role
membershipSchema.pre('save', function(next) {
  if (this.isModified('role') || this.permissions.length === 0) {
    switch (this.role) {
      case 'owner':
        this.permissions = [
          'manage_brand',
          'connect_channels',
          'create_posts',
          'publish_posts',
          'view_analytics',
          'view_posts',
          'view_media',
          'invite_members',
          'manage_members',
          'delete_brand',
        ];
        break;
      case 'manager':
        this.permissions = [
          'connect_channels',
          'create_posts',
          'publish_posts',
          'view_analytics',
          'view_posts',
          'view_media',
          'invite_members',
        ];
        break;
      case 'editor':
        this.permissions = [
          'create_posts',
          'publish_posts',
          'view_analytics',
          'view_posts',
          'view_media',
        ];
        break;
      case 'viewer':
        this.permissions = [
          'view_analytics',
          'view_posts',
        ];
        break;
      default:
        this.permissions = ['view_analytics', 'view_posts'];
    }
  }
  next();
});

// Check if user has specific permission
membershipSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

// Check if user has any of the specified permissions
membershipSchema.methods.hasAnyPermission = function(permissions) {
  return permissions.some(p => this.permissions.includes(p));
};

module.exports = mongoose.model('Membership', membershipSchema);
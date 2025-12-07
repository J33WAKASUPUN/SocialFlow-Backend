const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    sparse: true,
  },
  description: {
    type: String,
    maxlength: 500,
    trim: true,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  settings: {
    timezone: {
      type: String,
      default: 'UTC',
    },
    features: {
      analytics: { type: Boolean, default: true },
      scheduling: { type: Boolean, default: true },
      teamCollaboration: { type: Boolean, default: true },
    },
  },
  subscription: {
    tier: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled'],
      default: 'active',
    },
    validUntil: Date,
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active',
  },
  deletedAt: Date,
}, {
  timestamps: true,
});

// Update unique index to exclude deleted organizations
organizationSchema.index(
  { name: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { status: { $ne: 'deleted' } } 
  }
);

// Auto-generate slug from name
organizationSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  next();
});

// Add member to organization
organizationSchema.methods.addMember = async function(userId, role = 'viewer') {
  const Membership = mongoose.model('Membership');
  return await Membership.create({
    user: userId,
    organization: this._id,
    role,
  });
};

// Remove member from organization
organizationSchema.methods.removeMember = async function(userId) {
  const Membership = mongoose.model('Membership');
  return await Membership.deleteMany({
    user: userId,
    organization: this._id,
  });
};

module.exports = mongoose.model('Organization', organizationSchema);
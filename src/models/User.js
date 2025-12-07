const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Authentication
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: function() {
      return this.provider === 'local' && this.status !== 'pending';
    },
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  
  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local',
  },
  
  // Profile
  avatar: {
    type: String,
    default: null,
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
  
  // Google OAuth
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  googleEmail: {
    type: String,
    sparse: true,
  },
  googleAvatar: {
    type: String,
  },
  
  // Account Status
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending'],
    default: 'active',
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  
  // Password Reset
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  // Email Verification
  verificationToken: String,
  verificationTokenExpires: Date,
  
  // Invitation Token
  invitationToken: String,
  invitationTokenExpires: Date,
  
  // Metadata
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: Date,

    // 2FA Settings
  twoFactorAuth: {
    enabled: {
      type: Boolean,
      default: false,
    },
    method: {
      type: String,
      enum: ['totp', 'email', 'both'],
      default: 'email',
    },
    secret: {
      type: String, // TOTP secret (encrypted)
    },
    backupCodes: [{
      code: String,
      used: Boolean,
      usedAt: Date,
    }],
    lastVerifiedAt: {
      type: Date,
    },
    verificationRequired: {
      type: Boolean,
      default: false,
    },
  },
  
  // Session tracking for inactivity
  lastActivityAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  if (!this.password) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get avatar URL (prefer uploaded avatar, fallback to Google avatar)
userSchema.methods.getAvatarUrl = function() {
  // Prioritize user-uploaded avatar over Google avatar
  if (this.avatar) {
    return this.avatar;
  }
  if (this.googleAvatar) {
    return this.googleAvatar;
  }
  return null;
};

// Check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Increment login attempts
userSchema.methods.incrementLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours
  
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }
  
  return this.updateOne(updates);
};

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpires;
  delete user.verificationToken;
  delete user.verificationTokenExpires;
  delete user.invitationToken;
  delete user.invitationTokenExpires;
  delete user.loginAttempts;
  delete user.lockUntil;
  
  // Always recalculate avatarUrl
  user.avatarUrl = this.getAvatarUrl();
  
  return user;
};

// Check if 2FA verification is required (inactive for 3+ days)
userSchema.methods.requires2FAVerification = function() {
  if (!this.twoFactorAuth?.enabled) return false;
  
  const now = new Date();
  const lastActivity = this.lastActivityAt || this.lastLogin || this.createdAt;
  const daysSinceActivity = (now - lastActivity) / (1000 * 60 * 60 * 24);
  
  // Require 2FA if inactive for 3+ days
  return daysSinceActivity >= 3;
};

// Check if 2FA is recently verified (within session)
userSchema.methods.is2FARecentlyVerified = function() {
  if (!this.twoFactorAuth?.lastVerifiedAt) return false;
  
  const now = new Date();
  const hoursSinceVerification = (now - this.twoFactorAuth.lastVerifiedAt) / (1000 * 60 * 60);
  
  // Valid for 24 hours
  return hoursSinceVerification < 24;
};

module.exports = mongoose.model('User', userSchema);
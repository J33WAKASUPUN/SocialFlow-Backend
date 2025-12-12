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

  // Trusted devices tracking
    trustedDevices: [{
    deviceId: {
      type: String,
      required: true,
    },
    deviceName: String, // e.g., "Chrome on Windows"
    fingerprint: String, // Browser fingerprint hash
    ipAddress: String,
    userAgent: String,
    location: {
      country: String,
      city: String,
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: () => Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  }],

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
    // Device-based 2FA settings
    requireOnNewDevice: {
      type: Boolean,
      default: true, // Always require 2FA on new device
    },
    requireOnNewLocation: {
      type: Boolean,
      default: false, // Optional: require on new country
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

// Check if device is trusted
userSchema.methods.isDeviceTrusted = function(deviceId) {
  if (!this.trustedDevices || this.trustedDevices.length === 0) return false;
  
  const device = this.trustedDevices.find(d => 
    d.deviceId === deviceId && 
    d.expiresAt > Date.now()
  );
  
  return !!device;
};

// Add trusted device
userSchema.methods.addTrustedDevice = function(deviceInfo) {
  const { deviceId, deviceName, fingerprint, ipAddress, userAgent, location } = deviceInfo;
  
  // Remove expired devices
  this.trustedDevices = this.trustedDevices.filter(d => d.expiresAt > Date.now());
  
  // Check if device already exists
  const existingDevice = this.trustedDevices.find(d => d.deviceId === deviceId);
  
  if (existingDevice) {
    // Update last used and reset expiry
    existingDevice.lastUsed = Date.now();
    existingDevice.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // Reset to 30 days
    existingDevice.ipAddress = ipAddress; // Update IP
    if (location) existingDevice.location = location;
  } else {
    // Add new device (limit to 10 devices per user)
    if (this.trustedDevices.length >= 10) {
      // Remove oldest device
      this.trustedDevices.sort((a, b) => a.lastUsed - b.lastUsed);
      this.trustedDevices.shift();
    }

    this.trustedDevices.push({
      deviceId,
      deviceName,
      fingerprint,
      ipAddress,
      userAgent,
      location,
      lastUsed: Date.now(),
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }
};

// Remove trusted device
userSchema.methods.removeTrustedDevice = function(deviceId) {
  this.trustedDevices = this.trustedDevices.filter(d => d.deviceId !== deviceId);
};

// Check if 2FA verification is required
userSchema.methods.requires2FAVerification = function(deviceId = null, ipAddress = null) {
  if (!this.twoFactorAuth?.enabled) return false;
  
  // 1. Check if this is a new/untrusted device
  if (this.twoFactorAuth.requireOnNewDevice && deviceId) {
    const isTrusted = this.isDeviceTrusted(deviceId);
    if (!isTrusted) {
      return true; // Require 2FA for new device
    }
  }
  
  // 2. Check inactivity (3+ days) - EXISTING LOGIC
  const now = new Date();
  const lastActivity = this.lastActivityAt || this.lastLogin || this.createdAt;
  const daysSinceActivity = (now - lastActivity) / (1000 * 60 * 60 * 24);
  
  if (daysSinceActivity >= 3) {
    return true; // Require 2FA after 3 days inactive
  }
  
  // 3. Optional: Check new location/IP (implement if needed)
  // if (this.twoFactorAuth.requireOnNewLocation && ipAddress) {
  //   // TODO: Implement IP-based location check using GeoIP library
  // }
  
  return false;
};

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password; // Don't send actual password
  delete user.resetPasswordToken;
  delete user.resetPasswordExpires;
  delete user.verificationToken;
  delete user.verificationTokenExpires;
  delete user.invitationToken;
  delete user.invitationTokenExpires;
  delete user.loginAttempts;
  delete user.lockUntil;
  
  // Flag to indicate if user has password set (for frontend logic)
  user.hasPassword = !!this.password;
  
  // Always recalculate avatarUrl
  user.avatarUrl = this.getAvatarUrl();
  
  return user;
};

// Check if 2FA verification is required (inactive for 3+ days)
// userSchema.methods.requires2FAVerification = function() {
//   if (!this.twoFactorAuth?.enabled) return false;
  
//   const now = new Date();
//   const lastActivity = this.lastActivityAt || this.lastLogin || this.createdAt;
//   const daysSinceActivity = (now - lastActivity) / (1000 * 60 * 60 * 24);
  
//   // Require 2FA if inactive for 3+ days
//   return daysSinceActivity >= 3;
// };

// Check if 2FA is recently verified (within session)
userSchema.methods.is2FARecentlyVerified = function() {
  if (!this.twoFactorAuth?.lastVerifiedAt) return false;
  
  const now = new Date();
  const hoursSinceVerification = (now - this.twoFactorAuth.lastVerifiedAt) / (1000 * 60 * 60);
  
  // Valid for 24 hours
  return hoursSinceVerification < 24;
};

module.exports = mongoose.model('User', userSchema);
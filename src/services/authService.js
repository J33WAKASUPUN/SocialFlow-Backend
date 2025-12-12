const User = require("../models/User");
const { generateTokenPair } = require("../utils/jwt");
const crypto = require("crypto");
const emailService = require("./emailService");
const logger = require('../utils/logger');
const { generateDeviceFingerprint, getDeviceName, getLocationFromIP } = require('../utils/deviceFingerprint');

class AuthService {
  /**
 * Register New User
 */
async register(email, password, name) {
  // Check if user exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new Error("Email already registered");
  }

  // Create user
  const user = await User.create({
    email: email.toLowerCase(),
    password,
    name,
    provider: 'local',
  });

  // Generate verification token
  const verificationToken = crypto.randomBytes(32).toString("hex");
  user.verificationToken = verificationToken;
  user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
  await user.save();

  // Send verification email
  await emailService.sendVerificationEmail(
    user.email,
    verificationToken,
    user.name
  );

  // Send welcome email
  await emailService.sendWelcomeEmail(user.email, user.name);

  // AUTO-CREATE DEFAULT ORGANIZATION
  const organizationService = require('./organizationService');
  
  try {
    await organizationService.createOrganization(user._id, {
      name: `${name}'s Workspace`,
      description: 'Your default workspace',
    });
    
    logger.info(`✅ Auto-created default organization for new user: ${user.email}`);
  } catch (error) {
    logger.error('❌ Failed to create default organization:', error);
    // Don't throw error - user can create org manually later
  }

  const tokens = await generateTokenPair(user._id);

  return { user, tokens };
}

  /**
   * Verify Email
   */
  async verifyEmail(token) {
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new Error("Invalid or expired verification token");
    }

    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return { success: true, user };
  }

  /**
   * Resend Verification Email
   */
  async resendVerificationEmail(email) {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.emailVerified) {
      throw new Error("Email already verified");
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    // Send verification email
    await emailService.sendVerificationEmail(
      user.email,
      verificationToken,
      user.name
    );

    return { success: true };
  }

  /**
   * Login User - WITH DEVICE FINGERPRINTING
   */
  async login(email, password, req) {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Check if account is locked
    if (user.isLocked()) {
      throw new Error(
        "Account temporarily locked due to multiple failed login attempts"
      );
    }

    // Check if account is suspended
    if (user.status === "suspended") {
      throw new Error("Account has been suspended");
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      await user.incrementLoginAttempts();
      throw new Error("Invalid credentials");
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.updateOne({
        $set: { loginAttempts: 0, lastLogin: new Date() },
        $unset: { lockUntil: 1 },
      });
    } else {
      user.lastLogin = new Date();
      await user.save();
    }

    // Generate device fingerprint
    const deviceId = generateDeviceFingerprint(req);
    const deviceName = getDeviceName(req.headers['user-agent']);
    const ipAddress = req.ip || req.connection.remoteAddress;
    const location = getLocationFromIP(ipAddress);

    // Check if 2FA is required (now device-aware)
    const requires2FA = user.twoFactorAuth?.enabled && 
                        user.requires2FAVerification(deviceId, ipAddress);

    if (requires2FA) {
      // Return partial response - user needs to verify 2FA
      logger.info(`🔐 2FA required for user ${user.email}`, {
        reason: user.isDeviceTrusted(deviceId) ? 'inactivity' : 'new_device',
        deviceName,
        ipAddress,
      });
      
      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
        },
        tokens: null,
        requires2FA: true,
        twoFactorMethod: user.twoFactorAuth.method,
        deviceId, // Send deviceId to client (needed for complete login)
        deviceName, // Show user what device is logging in
      };
    }

    // Mark device as trusted
    user.addTrustedDevice({
      deviceId,
      deviceName,
      fingerprint: deviceId,
      ipAddress,
      userAgent: req.headers['user-agent'],
      location,
    });

    // Update last activity
    user.lastActivityAt = new Date();
    await user.save();

    // Generate tokens
    const tokens = await generateTokenPair(user._id);

    logger.info(`✅ Login successful for user ${user.email}`, {
      deviceName,
      trusted: true,
    });

    return { user, tokens, requires2FA: false };
  }

  /**
   * Complete login after 2FA verification - WITH DEVICE TRUST
   */
  async completeLoginAfter2FA(userId, deviceId, req) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Add this device to trusted list after successful 2FA
    const deviceName = getDeviceName(req.headers['user-agent']);
    const ipAddress = req.ip || req.connection.remoteAddress;
    const location = getLocationFromIP(ipAddress);

    user.addTrustedDevice({
      deviceId,
      deviceName,
      fingerprint: deviceId,
      ipAddress,
      userAgent: req.headers['user-agent'],
      location,
    });

    user.lastActivityAt = new Date();
    user.lastLogin = new Date();
    user.twoFactorAuth.lastVerifiedAt = new Date(); // Update last verification
    await user.save();

    const tokens = await generateTokenPair(user._id);

    logger.info(`✅ 2FA completed - device now trusted`, {
      userId: user._id,
      email: user.email,
      deviceName,
    });

    return { user, tokens };
  }

  /**
   * Google OAuth Login/Register - WITH DEVICE FINGERPRINTING
   */
  async googleAuth(profile, req) {
    const { id: googleId, emails, displayName, photos } = profile;
    const email = emails[0].value;
    const googleAvatar = photos && photos[0] ? photos[0].value : null;

    // Check if user exists with this Google ID
    let user = await User.findOne({ googleId });

    if (!user) {
      // Check if user exists with this email
      user = await User.findOne({ email: email.toLowerCase() });

      if (user) {
        // Link Google account to existing user
        user.googleId = googleId;
        user.googleEmail = email;
        user.googleAvatar = googleAvatar;
        user.emailVerified = true;
        user.provider = 'google';
        await user.save();
      } else {
        // Create new user
        user = await User.create({
          email: email.toLowerCase(),
          name: displayName,
          googleId,
          googleEmail: email,
          googleAvatar,
          emailVerified: true,
          status: "active",
          provider: 'google',
        });
      }
    } else {
      // Update last login
      user.lastLogin = new Date();
      user.googleAvatar = googleAvatar;
      await user.save();
    }

    // Generate device fingerprint
    const deviceId = generateDeviceFingerprint(req);
    const deviceName = getDeviceName(req.headers['user-agent']);
    const ipAddress = req.ip || req.connection.remoteAddress;
    const location = getLocationFromIP(ipAddress);

    // Check if 2FA is required (even for Google OAuth users)
    const requires2FA = user.twoFactorAuth?.enabled && 
                        user.requires2FAVerification(deviceId, ipAddress);

    if (requires2FA) {
      // Return partial response - need 2FA verification
      logger.info(`🔐 2FA required for Google OAuth user ${user.email}`, {
        reason: user.isDeviceTrusted(deviceId) ? 'inactivity' : 'new_device',
        deviceName,
      });
      
      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
        },
        tokens: null,
        requires2FA: true,
        twoFactorMethod: user.twoFactorAuth.method,
        deviceId,
        deviceName,
      };
    }

    // Mark device as trusted
    user.addTrustedDevice({
      deviceId,
      deviceName,
      fingerprint: deviceId,
      ipAddress,
      userAgent: req.headers['user-agent'],
      location,
    });

    user.lastActivityAt = new Date();
    await user.save();

    // CHECK IF USER HAS ANY ORGANIZATIONS
    const Membership = require('../models/Membership');
    const existingMemberships = await Membership.countDocuments({ user: user._id });

    // IF NO ORGANIZATIONS, CREATE DEFAULT ONE
    if (existingMemberships === 0) {
      const organizationService = require('./organizationService');
      
      try {
        await organizationService.createOrganization(user._id, {
          name: `${displayName}'s Workspace`,
          description: 'Your default workspace',
        });
        
        logger.info(`✅ Auto-created default organization for user: ${user.email}`);
      } catch (error) {
        logger.error('❌ Failed to create default organization:', error);
      }
    }

    // Generate tokens
    const tokens = await generateTokenPair(user._id);

    logger.info(`✅ Google OAuth login successful for ${user.email}`, {
      deviceName,
      trusted: true,
    });

    return { user, tokens, requires2FA: false };
  }

/**
   * Request Password Reset (CORRECTED)
   */
  async requestPasswordReset(email) {
    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration
    if (!user) {
      return { success: true };
    }

    // 1. Generate the RAW token (to send to user)
    const resetToken = crypto.randomBytes(32).toString("hex");

    // 2. Hash the token (to save to database)
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // 3. Save the HASHED token to the database
    user.resetPasswordToken = hashedToken; 
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    // 4. Send the RAW token via email
    await emailService.sendPasswordResetEmail(user.email, resetToken);

    return { success: true };
  }

/**
 * Reset Password - VERIFY HASHED TOKEN
 */
async resetPassword(token, newPassword) {
  // HASH the incoming token to match what's stored in DB
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken, // Compare hashed tokens
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new Error('Invalid or expired reset token');
  }

  // Validate new password strength
  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  logger.info('Password reset successful', { userId: user._id });

  return { success: true, message: 'Password reset successful' };
}

  /**
   * Change Password
   */
  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+password');

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return { success: true };
  }

/**
 * Set Password for Google OAuth Users (Backup Login)
 */
async setPasswordForGoogleUser(userId, newPassword) {
  const user = await User.findById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  // Only allow for Google OAuth users who don't have a password
  if (user.provider !== 'google') {
    throw new Error('This feature is only for Google OAuth users');
  }

  if (user.password) {
    throw new Error('You already have a password set. Use "Change Password" instead.');
  }

  // Validate password strength
  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Set password (will be hashed by pre-save hook)
  user.password = newPassword;
  // Keep provider as 'google' so they can still use Google OAuth
  // Don't change provider - user can login with BOTH methods now
  await user.save();

  logger.info(`✅ Backup password set for Google OAuth user: ${user.email}`);

  return { success: true, user };
}

  /**
   * Update Profile
   */
  async updateProfile(userId, data) {
    const allowedUpdates = ["name", "timezone"];
    const updates = {};

    Object.keys(data).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        updates[key] = data[key];
      }
    });

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  /**
   * Delete Account
   */
  async deleteAccount(userId) {
    const User = require('../models/User');
    const Organization = require('../models/Organization');
    const Brand = require('../models/Brand');
    const Post = require('../models/Post');
    const Media = require('../models/Media');
    const Notification = require('../models/Notification');

    // Delete all user's organizations (cascade will handle brands, channels, posts)
    await Organization.deleteMany({ owner: userId });

    // Delete user's notifications
    await Notification.deleteMany({ user: userId });

    // Delete user's media
    await Media.deleteMany({ uploadedBy: userId });

    // Finally delete user
    await User.findByIdAndDelete(userId);

    return { success: true };
  }

   /**
   * Upload Avatar
   */
  async uploadAvatar(userId, avatarUrl) {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Update avatar URL (Cloudinary URL)
    user.avatar = avatarUrl;
    await user.save();

    return user;
  }
}

module.exports = new AuthService();

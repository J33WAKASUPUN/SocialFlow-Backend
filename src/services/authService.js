const User = require("../models/User");
const { generateTokenPair } = require("../utils/jwt");
const crypto = require("crypto");
const emailService = require("./emailService");
const logger = require('../utils/logger');

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
   * Request Password Reset
   */
  async requestPasswordReset(email) {
    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Always return success to prevent email enumeration
    if (!user) {
      logger.warn('Password reset requested for non-existent email', { email });
      return { success: true, message: 'If that email exists, a reset link has been sent' };
    }

    // Generate cryptographically secure token (32 bytes = 64 hex chars)
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token before storing in database
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetPasswordToken = hashedToken; // Store hashed version
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    // Send ONLY the original token via email (never log it)
    await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);

    logger.info('Password reset email sent', { 
      userId: user._id, 
      email: user.email,
      // DO NOT LOG THE TOKEN
    });

    return { 
      success: true, 
      message: 'If that email exists, a reset link has been sent' 
    };
  }

  /**
   * Login User
   */
  async login(email, password) {
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

    // Check if 2FA is required
    const requires2FA = user.twoFactorAuth?.enabled && user.requires2FAVerification();

    if (requires2FA) {
      // Return partial response - user needs to verify 2FA
      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
        },
        tokens: null,
        requires2FA: true,
        twoFactorMethod: user.twoFactorAuth.method,
      };
    }

    // Update last activity
    user.lastActivityAt = new Date();
    await user.save();

    // Generate tokens
    const tokens = await generateTokenPair(user._id);

    return { user, tokens, requires2FA: false };
  }

  /**
   * Complete login after 2FA verification
   */
  async completeLoginAfter2FA(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    user.lastActivityAt = new Date();
    user.lastLogin = new Date();
    await user.save();

    const tokens = await generateTokenPair(user._id);

    return { user, tokens };
  }

/**
 * Google OAuth Login/Register
 */
async googleAuth(profile) {
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
    user.googleAvatar = googleAvatar; // Update avatar if changed
    await user.save();
  }

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
      // Don't throw error - user can create org manually later
    }
  }

  // Generate tokens
  const tokens = await generateTokenPair(user._id);

  return { user, tokens };
}

  /**
   * Request Password Reset
   */
  async requestPasswordReset(email) {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if email exists
      return { success: true };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    // Send reset email
    await emailService.sendPasswordResetEmail(user.email, resetToken);

    return { success: true };
  }

  /**
   * Reset Password - VERIFY HASHED TOKEN
   */
  async resetPassword(token, newPassword) {
    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
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

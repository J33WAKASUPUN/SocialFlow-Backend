const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const User = require('../models/User');
const emailService = require('./emailService');
const encryptionService = require('./encryptionService');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

class TwoFactorService {
  /**
   * Generate TOTP secret for user
   */
  async generateTOTPSecret(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const secret = speakeasy.generateSecret({
      name: `SocialFlow:${user.email}`,
      issuer: 'SocialFlow',
      length: 32,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Store encrypted secret temporarily (not enabled yet)
    const cacheClient = redisClient.getCache();
    await cacheClient.setEx(
      `2fa:setup:${userId}`,
      600, // 10 minutes
      JSON.stringify({
        secret: secret.base32,
        otpauth_url: secret.otpauth_url,
      })
    );

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntry: secret.base32,
    };
  }

  /**
   * Verify TOTP code and enable 2FA
   */
  async verifyAndEnableTOTP(userId, code) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Get temporary secret from cache
    const cacheClient = redisClient.getCache();
    const setupData = await cacheClient.get(`2fa:setup:${userId}`);
    
    if (!setupData) {
      throw new Error('2FA setup expired. Please start again.');
    }

    const { secret } = JSON.parse(setupData);

    // Verify code
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 2, // Allow 2 intervals tolerance
    });

    if (!verified) {
      throw new Error('Invalid verification code');
    }

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Save to user
    user.twoFactorAuth = {
      enabled: true,
      method: 'totp',
      secret: encryptionService.encrypt(secret),
      backupCodes: backupCodes.map(code => ({
        code: encryptionService.encrypt(code),
        used: false,
      })),
      lastVerifiedAt: new Date(),
      verificationRequired: false,
    };

    await user.save();

    // Clear setup cache
    await cacheClient.del(`2fa:setup:${userId}`);

    logger.info(`2FA enabled for user: ${user.email}`);

    return {
      success: true,
      backupCodes, // Show once to user
    };
  }

  /**
   * Generate backup codes
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  /**
   * Send email OTP
   */
  async sendEmailOTP(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis with 10 min expiry
    const cacheClient = redisClient.getCache();
    await cacheClient.setEx(
      `2fa:email:${userId}`,
      600, // 10 minutes
      otp
    );

    // Send email
    await emailService.send2FACodeEmail(user.email, user.name, otp);

    logger.info(`2FA email OTP sent to: ${user.email}`);

    return { success: true, message: 'Verification code sent to your email' };
  }

  /**
   * Verify 2FA code (TOTP or Email)
   */
  async verify2FACode(userId, code, method = 'auto') {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    if (!user.twoFactorAuth?.enabled) {
      throw new Error('2FA is not enabled for this account');
    }

    let verified = false;

    // Try TOTP first if available
    if ((method === 'auto' || method === 'totp') && user.twoFactorAuth.secret) {
      const secret = encryptionService.decrypt(user.twoFactorAuth.secret);
      verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 2,
      });
    }

    // Try email OTP
    if (!verified && (method === 'auto' || method === 'email')) {
      const cacheClient = redisClient.getCache();
      const storedOTP = await cacheClient.get(`2fa:email:${userId}`);
      
      if (storedOTP && storedOTP === code) {
        verified = true;
        await cacheClient.del(`2fa:email:${userId}`);
      }
    }

    // Try backup code
    if (!verified) {
      const backupCodeIndex = user.twoFactorAuth.backupCodes?.findIndex(bc => {
        if (bc.used) return false;
        const decrypted = encryptionService.decrypt(bc.code);
        return decrypted === code.toUpperCase();
      });

      if (backupCodeIndex !== -1) {
        user.twoFactorAuth.backupCodes[backupCodeIndex].used = true;
        user.twoFactorAuth.backupCodes[backupCodeIndex].usedAt = new Date();
        verified = true;
        logger.warn(`Backup code used by user: ${user.email}`);
      }
    }

    if (!verified) {
      throw new Error('Invalid verification code');
    }

    // Update verification timestamp
    user.twoFactorAuth.lastVerifiedAt = new Date();
    user.twoFactorAuth.verificationRequired = false;
    user.lastActivityAt = new Date();
    await user.save();

    logger.info(`2FA verified for user: ${user.email}`);

    return { success: true };
  }

  /**
   * Disable 2FA
   */
  async disable2FA(userId, password) {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new Error('User not found');

    // Verify password
    if (user.provider === 'local') {
      const isValid = await user.comparePassword(password);
      if (!isValid) throw new Error('Invalid password');
    }

    user.twoFactorAuth = {
      enabled: false,
      method: 'email',
      secret: undefined,
      backupCodes: [],
      lastVerifiedAt: undefined,
      verificationRequired: false,
    };

    await user.save();

    logger.info(`2FA disabled for user: ${user.email}`);

    return { success: true };
  }

  /**
   * Enable email-only 2FA (simpler option)
   */
  async enableEmail2FA(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    user.twoFactorAuth = {
      enabled: true,
      method: 'email',
      secret: undefined,
      backupCodes: backupCodes.map(code => ({
        code: encryptionService.encrypt(code),
        used: false,
      })),
      lastVerifiedAt: new Date(),
      verificationRequired: false,
    };

    await user.save();

    logger.info(`Email 2FA enabled for user: ${user.email}`);

    return {
      success: true,
      backupCodes,
    };
  }

    /**
   * Verify email OTP during setup (before 2FA is enabled)
   */
  async verifySetupEmailOTP(userId, code) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const cacheClient = redisClient.getCache();
    const storedOTP = await cacheClient.get(`2fa:email:${userId}`);
    
    if (!storedOTP) {
      throw new Error('Verification code expired. Please request a new one.');
    }

    if (storedOTP !== code) {
      throw new Error('Invalid verification code');
    }

    // Clear the OTP after successful verification
    await cacheClient.del(`2fa:email:${userId}`);

    logger.info(`Email OTP verified during setup for user: ${user.email}`);

    return { success: true };
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId, password) {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new Error('User not found');

    if (!user.twoFactorAuth?.enabled) {
      throw new Error('2FA is not enabled');
    }

    // Verify password
    if (user.provider === 'local') {
      const isValid = await user.comparePassword(password);
      if (!isValid) throw new Error('Invalid password');
    }

    const backupCodes = this.generateBackupCodes();

    user.twoFactorAuth.backupCodes = backupCodes.map(code => ({
      code: encryptionService.encrypt(code),
      used: false,
    }));

    await user.save();

    logger.info(`Backup codes regenerated for user: ${user.email}`);

    return { backupCodes };
  }

  /**
   * Get 2FA status for user
   */
  async get2FAStatus(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const backupCodesRemaining = user.twoFactorAuth?.backupCodes?.filter(bc => !bc.used).length || 0;

    return {
      enabled: user.twoFactorAuth?.enabled || false,
      method: user.twoFactorAuth?.method || 'email',
      backupCodesRemaining,
      lastVerifiedAt: user.twoFactorAuth?.lastVerifiedAt,
      verificationRequired: user.requires2FAVerification(),
    };
  }
}

module.exports = new TwoFactorService();
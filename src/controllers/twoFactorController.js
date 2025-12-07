const twoFactorService = require('../services/twoFactorService');
const logger = require('../utils/logger');

class TwoFactorController {
  /**
   * GET /api/v1/auth/2fa/status
   * Get 2FA status
   */
  async getStatus(req, res, next) {
    try {
      const status = await twoFactorService.get2FAStatus(req.user._id);
      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/2fa/setup/totp
   * Start TOTP setup
   */
  async setupTOTP(req, res, next) {
    try {
      const result = await twoFactorService.generateTOTPSecret(req.user._id);
      res.json({
        success: true,
        message: 'Scan the QR code with your authenticator app',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/2fa/verify-setup
   * Verify and enable TOTP
   */
  async verifySetup(req, res, next) {
    try {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Verification code is required',
        });
      }

      const result = await twoFactorService.verifyAndEnableTOTP(req.user._id, code);
      
      res.json({
        success: true,
        message: '2FA has been enabled successfully',
        data: {
          backupCodes: result.backupCodes,
          warning: 'Save these backup codes securely. They will not be shown again.',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/2fa/enable-email
   * Enable email-based 2FA
   */
  async enableEmail2FA(req, res, next) {
    try {
      const result = await twoFactorService.enableEmail2FA(req.user._id);
      
      res.json({
        success: true,
        message: 'Email 2FA has been enabled',
        data: {
          backupCodes: result.backupCodes,
          warning: 'Save these backup codes securely. They will not be shown again.',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/2fa/send-code
   * Send email OTP
   */
  async sendCode(req, res, next) {
    try {
      const { userId } = req.body;
      
      // Can be called without auth (during login)
      const targetUserId = userId || req.user?._id;
      
      if (!targetUserId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
      }

      const result = await twoFactorService.sendEmailOTP(targetUserId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/2fa/verify
   * Verify 2FA code
   */
  async verifyCode(req, res, next) {
    try {
      const { code, userId } = req.body;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Verification code is required',
        });
      }

      const targetUserId = userId || req.user?._id;
      
      if (!targetUserId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
      }

      await twoFactorService.verify2FACode(targetUserId, code);
      
      res.json({
        success: true,
        message: '2FA verification successful',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/2fa/disable
   * Disable 2FA
   */
  async disable(req, res, next) {
    try {
      const { password } = req.body;
      
      if (!password && req.user.provider === 'local') {
        return res.status(400).json({
          success: false,
          message: 'Password is required to disable 2FA',
        });
      }

      await twoFactorService.disable2FA(req.user._id, password);
      
      res.json({
        success: true,
        message: '2FA has been disabled',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/2fa/regenerate-backup
   * Regenerate backup codes
   */
  async regenerateBackupCodes(req, res, next) {
    try {
      const { password } = req.body;
      
      if (!password && req.user.provider === 'local') {
        return res.status(400).json({
          success: false,
          message: 'Password is required',
        });
      }

      const result = await twoFactorService.regenerateBackupCodes(req.user._id, password);
      
      res.json({
        success: true,
        message: 'Backup codes regenerated',
        data: {
          backupCodes: result.backupCodes,
          warning: 'Save these backup codes securely. Old codes are now invalid.',
        },
      });
    } catch (error) {
      next(error);
    }
  }

    /**
   * POST /api/v1/auth/2fa/verify-email-setup
   * Verify email code during 2FA setup (before enabling)
   */
  async verifyEmailSetup(req, res, next) {
    try {
      const { code } = req.body;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Verification code is required',
        });
      }

      // Verify the setup OTP
      await twoFactorService.verifySetupEmailOTP(req.user._id, code);
      
      // Now enable email 2FA
      const result = await twoFactorService.enableEmail2FA(req.user._id);
      
      res.json({
        success: true,
        message: 'Email 2FA has been enabled successfully',
        data: {
          backupCodes: result.backupCodes,
          warning: 'Save these backup codes securely. They will not be shown again.',
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TwoFactorController();
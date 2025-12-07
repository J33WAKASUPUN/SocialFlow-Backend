const authService = require("../services/authService");
const emailService = require("../services/emailService");
const cloudinaryService = require("../services/cloudinaryService");
const logger = require('../utils/logger');
const {
  verifyToken,
  blacklistToken,
  generateTokenPair,
} = require("../utils/jwt");

class AuthController {
  /**
   * POST /api/v1/auth/register
   */
  async register(req, res, next) {
    try {
      const { email, password, name } = req.body;

      // Validation
      if (!email || !password || !name) {
        return res.status(400).json({
          success: false,
          message: "Email, password, and name are required",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }

      const { user, tokens } = await authService.register(
        email,
        password,
        name
      );

      res.status(201).json({
        success: true,
        message: "Registration successful",
        data: {
          user,
          tokens,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/login
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required",
        });
      }

      const result = await authService.login(email, password);

      // Check if 2FA is required
      if (result.requires2FA) {
        return res.json({
          success: true,
          message: "2FA verification required",
          data: {
            requires2FA: true,
            userId: result.user._id,
            twoFactorMethod: result.twoFactorMethod,
          },
        });
      }

      res.json({
        success: true,
        message: "Login successful",
        data: {
          user: result.user,
          tokens: result.tokens,
          requires2FA: false,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/complete-2fa-login
   * Complete login after 2FA verification
   */
  async complete2FALogin(req, res, next) {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      const { user, tokens } = await authService.completeLoginAfter2FA(userId);

      res.json({
        success: true,
        message: "Login successful",
        data: {
          user,
          tokens,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   */
  async logout(req, res, next) {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");

      if (token) {
        await blacklistToken(token);
      }

      res.json({
        success: true,
        message: "Logout successful",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh-token
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: "Refresh token is required",
        });
      }

      const decoded = await verifyToken(refreshToken, true);
      const tokens = await generateTokenPair(decoded.userId);

      res.json({
        success: true,
        message: "Token refreshed successfully",
        data: { tokens },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/me
   */
  async getMe(req, res, next) {
    try {
      res.json({
        success: true,
        data: { user: req.user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/auth/profile
   */
  async updateProfile(req, res, next) {
    try {
      const user = await authService.updateProfile(req.user._id, req.body);

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/upload-avatar
   */
   async uploadAvatar(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      // Upload to Cloudinary
      const uploadResult = await cloudinaryService.uploadImage(req.file.path, {
        folder: 'avatars',
        public_id: `avatar-${req.user._id}`,
        overwrite: true,
      });

      // Use 'url' not 'secure_url' - check what cloudinaryService returns
      const avatarUrl = uploadResult.url || uploadResult.secure_url;

      // Update user avatar
      const user = await authService.uploadAvatar(
        req.user._id,
        avatarUrl
      );

      res.json({
        success: true,
        message: "Avatar uploaded successfully",
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/auth/password
   */
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 8 characters",
        });
      }

      // Only allow password change for local accounts
      if (req.user.provider !== 'local') {
        return res.status(400).json({
          success: false,
          message: "Cannot change password for OAuth accounts",
        });
      }

      await authService.changePassword(
        req.user._id,
        currentPassword,
        newPassword
      );

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/forgot-password
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      await authService.requestPasswordReset(email);

      res.json({
        success: true,
        message: "If the email exists, a reset link has been sent",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/reset-password
   */
  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({
          success: false,
          message: "Token and new password are required",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters",
        });
      }

      await authService.resetPassword(token, password);

      res.json({
        success: true,
        message: "Password reset successful",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/test-email (For testing email service)
   */
  async testEmail(req, res, next) {
    try {
      const email = req.query.email || req.user?.email;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email parameter required",
        });
      }

      const result = await emailService.sendTestEmail(email);

      res.json({
        success: result.success,
        message: result.success
          ? `Test email sent to ${email}`
          : "Failed to send test email",
        messageId: result.messageId,
      });
    } catch (error) {
      next(error);
    }
  }

   /**
   * GET /api/v1/auth/verify-email?token=xxx
   */
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: "Verification token is required",
        });
      }

      const result = await authService.verifyEmail(token);

      res.json({
        success: true,
        message: "Email verified successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/resend-verification
   */
  async resendVerification(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      await authService.resendVerificationEmail(email);

      res.json({
        success: true,
        message: "Verification email sent",
      });
    } catch (error) {
      next(error);
    }
  }

   /**
   * DELETE /api/v1/auth/account
   */
  async deleteAccount(req, res, next) {
    try {
      await authService.deleteAccount(req.user._id);

      res.json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
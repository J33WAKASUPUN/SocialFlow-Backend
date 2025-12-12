const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const twoFactorController = require('../controllers/twoFactorController');
const { requireAuth, optionalAuth } = require('../middlewares/auth');
const { 
  authLimiter, 
  forgotPasswordLimiter, 
  twoFactorLimiter 
} = require('../middlewares/rateLimiter');
const { validateEmail, validatePassword } = require('../middlewares/validateInput');
const { uploadAvatar } = require('../middlewares/upload');
const logger = require('../utils/logger');

// Validate email and password for registration
router.post(
  '/register',
  authLimiter,
  validateEmail,
  validatePassword,
  authController.register
);

// Validate email for login
router.post(
  '/login',
  authLimiter,
  validateEmail,
  authController.login
);

router.post('/refresh-token', authController.refreshToken);

// Validate email for password reset
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validateEmail,
  authController.forgotPassword
);

// The validation should happen in the controller after we verify the token exists
router.post(
  '/reset-password',
  authController.resetPassword
);

router.get('/verify-email', authController.verifyEmail);

// Validate email for resend verification
router.post(
  '/resend-verification',
  forgotPasswordLimiter,
  validateEmail,
  authController.resendVerification
);

// Protected routes
router.get('/me', requireAuth, authController.getMe);
router.post('/logout', requireAuth, authController.logout);
router.patch('/profile', requireAuth, authController.updateProfile);
router.patch('/avatar', requireAuth, uploadAvatar, authController.uploadAvatar);

// Validate new password for password change
router.patch(
  '/password',
  requireAuth,
  validatePassword,
  authController.changePassword
);

router.delete('/account', requireAuth, authController.deleteAccount);

// 2FA routes
router.get('/2fa/status', requireAuth, twoFactorController.getStatus);
router.post('/2fa/setup/totp', requireAuth, twoFactorController.setupTOTP);
router.post('/2fa/verify-setup', requireAuth, twoFactorLimiter, twoFactorController.verifySetup);
router.post('/2fa/enable-email', requireAuth, twoFactorController.enableEmail2FA);
// This allows them to work for both Logged In users (Settings) AND Unauthenticated users (Login flow)
router.post('/2fa/send-code', optionalAuth, twoFactorLimiter, twoFactorController.sendCode);
router.post('/2fa/verify', optionalAuth, twoFactorLimiter, twoFactorController.verifyCode);
router.post('/2fa/verify-email-setup', requireAuth, twoFactorLimiter, twoFactorController.verifyEmailSetup);
router.post('/2fa/disable', requireAuth, twoFactorController.disable);
router.post('/2fa/regenerate-backup', requireAuth, twoFactorController.regenerateBackupCodes);
router.post('/2fa/complete-login', authController.complete2FALogin);

// Trusted Devices Management
router.get('/trusted-devices', requireAuth, authController.getTrustedDevices);
router.delete('/trusted-devices/:deviceId', requireAuth, authController.removeTrustedDevice);
router.delete('/trusted-devices', requireAuth, authController.removeAllTrustedDevices);

// Google OAuth
router.get('/google', passport.authenticate('google', { 
  scope: ['profile', 'email'],
  session: false 
}));

router.get('/google/callback', 
  passport.authenticate('google', { 
    session: false, 
    failureRedirect: `${process.env.CLIENT_URL}/login?error=auth_failed` 
  }),
  async (req, res) => {
    try {
      // req.user already contains the result from googleAuth()
      // Don't call authService.googleAuth() again!
      const result = req.user; // This is the result from the Passport strategy
      
      // Check if 2FA is required
      if (result.requires2FA) {
        logger.info('🔐 Redirecting to 2FA verification page', {
          userId: result.user._id,
          deviceName: result.deviceName,
        });
        
        return res.redirect(
          `${process.env.CLIENT_URL}/2fa-verify?` +
          `userId=${result.user._id}&` +
          `method=${result.twoFactorMethod}&` +
          `deviceId=${result.deviceId}&` +
          `deviceName=${encodeURIComponent(result.deviceName)}`
        );
      }

      // Normal login - redirect with tokens
      const { user, tokens } = result;
      
      logger.info('✅ Google OAuth login successful', {
        userId: user._id,
        email: user.email,
      });
      
      res.redirect(
        `${process.env.CLIENT_URL}/google/callback?` +
        `token=${tokens.accessToken}&` +
        `refresh=${tokens.refreshToken}`
      );
    } catch (error) {
      logger.error('❌ Google OAuth callback error:', error);
      res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
    }
  }
);

module.exports = router;
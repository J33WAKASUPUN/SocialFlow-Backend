const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const twoFactorController = require('../controllers/twoFactorController');
const { requireAuth, optionalAuth } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');
const { uploadAvatar } = require('../middlewares/upload');

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User authentication and authorization
 */

// Public routes
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authLimiter, authController.resendVerification);

// Protected routes
router.get('/me', requireAuth, authController.getMe);
router.post('/logout', requireAuth, authController.logout);
router.patch('/profile', requireAuth, authController.updateProfile);
router.patch('/avatar', requireAuth, uploadAvatar, authController.uploadAvatar);
router.patch('/password', requireAuth, authController.changePassword);
router.delete('/account', requireAuth, authController.deleteAccount);

// Get 2FA status
router.get('/2fa/status', requireAuth, twoFactorController.getStatus);

// Setup TOTP (authenticator app)
router.post('/2fa/setup/totp', requireAuth, twoFactorController.setupTOTP);

// Verify TOTP setup and enable
router.post('/2fa/verify-setup', requireAuth, twoFactorController.verifySetup);

// Enable email-based 2FA
router.post('/2fa/enable-email', requireAuth, twoFactorController.enableEmail2FA);

// Send email OTP (can be called during login)
router.post('/2fa/send-code', optionalAuth, authLimiter, twoFactorController.sendCode);

// Verify email OTP and enable 2FA (during setup)
router.post('/2fa/verify-email-setup', requireAuth, twoFactorController.verifyEmailSetup);

// Verify 2FA code (can be called during login)
router.post('/2fa/verify', optionalAuth, authLimiter, twoFactorController.verifyCode);

// Disable 2FA
router.post('/2fa/disable', requireAuth, twoFactorController.disable);

// Regenerate backup codes
router.post('/2fa/regenerate-backup', requireAuth, twoFactorController.regenerateBackupCodes);

// Complete login after 2FA verification
router.post('/complete-2fa-login', authLimiter, authController.complete2FALogin);

// Google OAuth routes
router.get('/google', 
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    session: false 
  })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    const { user, tokens } = req.user;
    const frontendUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    
    res.redirect(
      `${frontendUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`
    );
  }
);

// Development only
if (process.env.NODE_ENV === 'development') {
  router.get('/test-email', authController.testEmail);
}

module.exports = router;
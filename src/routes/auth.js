const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const twoFactorController = require('../controllers/twoFactorController');
const { requireAuth } = require('../middlewares/auth');
const { 
  authLimiter, 
  forgotPasswordLimiter, 
  twoFactorLimiter 
} = require('../middlewares/rateLimiter');
const { validateEmail, validatePassword } = require('../middlewares/validateInput');
const { uploadAvatar } = require('../middlewares/upload');

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

// Validate password for password reset
router.post(
  '/reset-password',
  validatePassword,
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

// 2FA routes (already rate-limited)
router.get('/2fa/status', requireAuth, twoFactorController.getStatus);
router.post('/2fa/setup/totp', requireAuth, twoFactorController.setupTOTP);
router.post('/2fa/verify-setup', requireAuth, twoFactorLimiter, twoFactorController.verifySetup);
router.post('/2fa/enable-email', requireAuth, twoFactorController.enableEmail2FA);
router.post('/2fa/send-code', twoFactorLimiter, twoFactorController.sendCode);
router.post('/2fa/verify', twoFactorLimiter, twoFactorController.verifyCode);
router.post('/2fa/verify-email-setup', requireAuth, twoFactorLimiter, twoFactorController.verifyEmailSetup);
router.post('/2fa/disable', requireAuth, twoFactorController.disable);
router.post('/2fa/regenerate-backup', requireAuth, twoFactorController.regenerateBackupCodes);
router.post('/2fa/complete-login', authController.complete2FALogin);

// Google OAuth
router.get('/google', passport.authenticate('google', { 
  scope: ['profile', 'email'],
  session: false 
}));

router.get('/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=auth_failed` }),
  (req, res) => {
    const { user, tokens } = req.user;
    res.redirect(`${process.env.CLIENT_URL}/google/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`);
  }
);

module.exports = router;
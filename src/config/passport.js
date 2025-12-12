const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const authService = require('../services/authService');
const logger = require('../utils/logger');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_AUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/v1/auth/google/callback',
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // PASS req TO authService for device fingerprinting
        const result = await authService.googleAuth(profile, req);
        
        // Return the full result (includes requires2FA flag)
        return done(null, result);
      } catch (error) {
        logger.error('Google OAuth error:', error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((data, done) => {
  done(null, data);
});

passport.deserializeUser((data, done) => {
  done(null, data);
});

module.exports = passport;
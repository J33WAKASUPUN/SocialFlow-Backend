const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Require Authentication
 */
const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }
    
    const decoded = await verifyToken(token);
    const user = await User.findById(decoded.userId);
    
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication',
      });
    }
    
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Invalid authentication',
    });
  }
};

/**
 * Optional Authentication
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const decoded = await verifyToken(token);
      const user = await User.findById(decoded.userId);
      
      if (user && user.status === 'active') {
        req.user = user;
        req.userId = user._id;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

module.exports = {
  requireAuth,
  optionalAuth,
};
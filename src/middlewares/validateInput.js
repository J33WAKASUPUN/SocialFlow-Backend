const mongoose = require('mongoose');

/**
 * Validate MongoDB ObjectId
 */
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName] || req.query[paramName] || req.body[paramName];
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: `${paramName} is required`,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`,
      });
    }

    next();
  };
};

/**
 * Sanitize query parameters
 */
const sanitizeQuery = (req, res, next) => {
  // Remove any $ operators from query params (prevent NoSQL injection)
  Object.keys(req.query).forEach(key => {
    if (typeof req.query[key] === 'string' && req.query[key].includes('$')) {
      delete req.query[key];
    }
  });
  
  next();
};

/**
 * Validate email format
 */
const validateEmail = (req, res, next) => {
  const email = req.body.email;
  
  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required',
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email format',
    });
  }

  next();
};

/**
 * Validate password strength
 */
const validatePassword = (req, res, next) => {
  const password = req.body.password || req.body.newPassword;
  
  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters',
    });
  }

  // Check password strength
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  
  if (!hasUpperCase || !hasLowerCase || !hasNumber) {
    return res.status(400).json({
      success: false,
      message: 'Password must contain uppercase, lowercase, and numbers',
    });
  }

  next();
};

module.exports = {
  validateObjectId,
  sanitizeQuery,
  validateEmail,
  validatePassword,
};
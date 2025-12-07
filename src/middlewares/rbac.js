const Membership = require('../models/Membership');
const Brand = require('../models/Brand');

/**
 * Check if user has required role
 */
const requireRole = (roles) => {
  return async (req, res, next) => {
    try {
      const { brandId } = req.params;
      const userId = req.user._id;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: 'Brand ID is required',
        });
      }

      const membership = await Membership.findOne({
        user: userId,
        brand: brandId,
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      
      if (!allowedRoles.includes(membership.role)) {
        return res.status(403).json({
          success: false,
          message: `Required role: ${allowedRoles.join(' or ')}`,
        });
      }

      req.membership = membership;
      req.brand = await Brand.findById(brandId);
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has required permission
 */
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      const { brandId } = req.params;
      const userId = req.user._id;

      if (!brandId) {
        return res.status(400).json({
          success: false,
          message: 'Brand ID is required',
        });
      }

      const membership = await Membership.findOne({
        user: userId,
        brand: brandId,
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      if (!membership.hasPermission(permission)) {
        return res.status(403).json({
          success: false,
          message: `Permission required: ${permission}`,
        });
      }

      req.membership = membership;
      req.brand = await Brand.findById(brandId);
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has access to brand
 */
const checkBrandAccess = async (req, res, next) => {
  try {
    const { brandId } = req.params;
    const userId = req.user._id;

    if (!brandId) {
      return res.status(400).json({
        success: false,
        message: 'Brand ID is required',
      });
    }

    const membership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    req.membership = membership;
    req.brand = await Brand.findById(brandId);
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requireRole,
  requirePermission,
  checkBrandAccess,
};
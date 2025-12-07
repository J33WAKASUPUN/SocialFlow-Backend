const brandService = require('../services/brandService');
const Brand = require('../models/Brand');
const User = require('../models/User');
const Membership = require('../models/Membership');

class BrandController {
  /**
   * GET /api/v1/organizations/:id/brands
   * Get all brands for an organization
   */
  async getOrganizationBrands(req, res, next) {
    try {
      const brands = await Brand.find({
        organization: req.params.id,
        status: 'active',
      })
        .populate('organization', 'name slug')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: brands,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/organizations/:id/brands
   * Create brand under organization
   */
  async createBrandUnderOrganization(req, res, next) {
    try {
      const { name, description, logo, website } = req.body;
      const organizationId = req.params.id;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Brand name is required',
        });
      }

      const brand = await brandService.createBrand(req.user._id, {
        name,
        organizationId,
        description,
        logo,
        website,
      });

      res.status(201).json({
        success: true,
        message: 'Brand created successfully',
        data: brand,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/brands
   */
  async createBrand(req, res, next) {
    try {
      const { name, organizationId, description, settings, logo, website } = req.body;

      if (!name || !organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Brand name and organization ID are required',
        });
      }

      const brand = await brandService.createBrand(req.user._id, {
        name,
        organizationId,
        description,
        settings,
        logo,
        website,
      });

      res.status(201).json({
        success: true,
        message: 'Brand created successfully',
        data: brand,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/brands
   */
  async getUserBrands(req, res, next) {
    try {
      const brands = await brandService.getUserBrands(req.user._id);

      res.json({
        success: true,
        data: brands,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/brands/:brandId
   */
  async getBrandById(req, res, next) {
    try {
      const brand = await brandService.getBrandById(req.params.brandId, req.user._id);

      res.json({
        success: true,
        data: brand,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/brands/:brandId
   */
  async updateBrand(req, res, next) {
    try {
      const brand = await brandService.updateBrand(
        req.params.brandId,
        req.user._id,
        req.body
      );

      res.json({
        success: true,
        message: 'Brand updated successfully',
        data: brand,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/brands/:brandId
   */
  async deleteBrand(req, res, next) {
    try {
      await brandService.deleteBrand(req.params.brandId, req.user._id);

      res.json({
        success: true,
        message: 'Brand deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/brands/:brandId/members
   */
  async getBrandMembers(req, res, next) {
    try {
      const members = await brandService.getBrandMembers(
        req.params.brandId,
        req.user._id
      );

      res.json({
        success: true,
        data: members,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/brands/:brandId/members
   */
  async inviteMember(req, res, next) {
    try {
      const { email, role } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required',
        });
      }

      const membership = await brandService.inviteMember(
        req.params.brandId,
        req.user._id,
        { email, role }
      );

      res.status(201).json({
        success: true,
        message: 'Invitation sent successfully',
        data: membership,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/brands/:brandId/members/:memberId
   */
  async updateMemberRole(req, res, next) {
    try {
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'Role is required',
        });
      }

      const membership = await brandService.updateMemberRole(
        req.params.brandId,
        req.user._id,
        req.params.memberId,
        role
      );

      res.json({
        success: true,
        message: 'Member role updated successfully',
        data: membership,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/brands/:brandId/members/:memberId
   */
  async removeMember(req, res, next) {
    try {
      await brandService.removeMember(
        req.params.brandId,
        req.user._id,
        req.params.memberId
      );

      res.json({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/brands/invitations/:token
   * Get invitation details
   */
  async getInvitationDetails(req, res, next) {
    try {
      const { token } = req.params;

      const user = await User.findOne({
        invitationToken: token,
        invitationTokenExpires: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired invitation',
        });
      }

      const membership = await Membership.findOne({
        user: user._id,
        status: 'pending',
      })
        .populate('brand', 'name description')
        .populate('organization', 'name')
        .populate('invitedBy', 'name email');

      if (!membership) {
        return res.status(400).json({
          success: false,
          message: 'Invitation not found',
        });
      }

      res.json({
        success: true,
        data: {
          email: user.email,
          brand: membership.brand,
          organization: membership.organization,
          role: membership.role,
          invitedBy: membership.invitedBy,
          invitedAt: membership.invitedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/brands/invitations/:token/accept
   * Accept invitation and set password
   */
  async acceptInvitation(req, res, next) {
    try {
      const { token } = req.params;
      const { password, name } = req.body;

      if (!password || password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters',
        });
      }

      const user = await User.findOne({
        invitationToken: token,
        invitationTokenExpires: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired invitation',
        });
      }

      // Set password and activate account
      user.password = password;
      if (name) user.name = name;
      user.status = 'active';
      user.invitationToken = undefined;
      user.invitationTokenExpires = undefined;
      await user.save();

      // Activate membership
      await Membership.updateMany(
        { user: user._id, status: 'pending' },
        { $set: { status: 'active', acceptedAt: new Date() } }
      );

      // Generate tokens
      const { generateTokenPair } = require('../utils/jwt');
      const tokens = await generateTokenPair(user._id);

      res.json({
        success: true,
        message: 'Invitation accepted successfully',
        data: { user, tokens },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BrandController();
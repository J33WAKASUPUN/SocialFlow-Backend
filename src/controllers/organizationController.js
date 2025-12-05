const organizationService = require('../services/organizationService');
const Membership = require('../models/Membership');
const User = require('../models/User');
const emailService = require('../services/emailService');
const crypto = require('crypto');

class OrganizationController {
  /**
   * POST /api/v1/organizations
   */
  async createOrganization(req, res, next) {
    try {
      const { name, description, settings } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Organization name is required',
        });
      }

      const result = await organizationService.createOrganization(
        req.user._id,
        { name, description, settings }
      );

      res.status(201).json({
        success: true,
        message: 'Organization created successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/organizations
   */
  async getUserOrganizations(req, res, next) {
    try {
      const organizations = await organizationService.getUserOrganizations(req.user._id);

      res.json({
        success: true,
        data: organizations,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/organizations/:id
   */
  async updateOrganization(req, res, next) {
    try {
      const organization = await organizationService.updateOrganization(
        req.params.id,
        req.user._id,
        req.body
      );

      res.json({
        success: true,
        message: 'Organization updated successfully',
        data: organization,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/organizations/:id
   */
  async deleteOrganization(req, res, next) {
    try {
      const result = await organizationService.deleteOrganization(
        req.params.id, 
        req.user._id
      );

      res.json({
        success: true,
        message: result.message || 'Organization deleted successfully',
      });
    } catch (error) {
      // Return proper error response
      if (error.message === 'Organization not found') {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      
      if (error.message === 'Only the owner can delete the organization') {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }
      
      next(error);
    }
  }

  /**
   * GET /api/v1/organizations/:id/members
   */
  async getMembers(req, res, next) {
    try {
      const { id: organizationId } = req.params;

      // Check if user is member of org
      const currentMembership = await Membership.findOne({
        user: req.user._id,
        organization: organizationId,
      });

      if (!currentMembership) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this organization',
        });
      }

      const members = await Membership.find({ organization: organizationId })
        .populate('user', 'name email avatar avatarUrl')
        .sort({ createdAt: 1 });

      res.json({
        success: true,
        data: members,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/organizations/:id/members
   */
  async inviteMember(req, res, next) {
    try {
      const { id: organizationId } = req.params;
      const { email, role } = req.body;
      const currentUserId = req.user._id;

      // Check current user's permission
      const currentMembership = await Membership.findOne({
        user: currentUserId,
        organization: organizationId,
      });

      if (!currentMembership) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this organization',
        });
      }

      // Only owner and manager can invite
      if (!['owner', 'manager'].includes(currentMembership.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only owners and managers can invite members',
        });
      }

      // Manager can only invite viewer and editor
      if (currentMembership.role === 'manager' && role === 'manager') {
        return res.status(403).json({
          success: false,
          message: 'Managers cannot invite other managers',
        });
      }

      // Find or create user
      let user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        // Create pending user with invitation
        const invitationToken = crypto.randomBytes(32).toString('hex');
        user = await User.create({
          email: email.toLowerCase(),
          name: email.split('@')[0],
          status: 'pending',
          invitationToken,
          invitationTokenExpires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        // Send invitation email
        try {
          await emailService.sendTeamInvitationEmail(
            email,
            req.user.name,
            'Organization',
            invitationToken
          );
        } catch (emailError) {
          console.error('Failed to send invitation email:', emailError);
        }
      }

      // Check if already a member
      const existingMembership = await Membership.findOne({
        user: user._id,
        organization: organizationId,
      });

      if (existingMembership) {
        return res.status(400).json({
          success: false,
          message: 'User is already a member of this organization',
        });
      }

      // Create membership
      const membership = await Membership.create({
        user: user._id,
        organization: organizationId,
        role: role || 'viewer',
        invitedBy: currentUserId,
        status: user.status === 'pending' ? 'pending' : 'active',
      });

      const populatedMembership = await Membership.findById(membership._id)
        .populate('user', 'name email avatar');

      res.status(201).json({
        success: true,
        message: 'Member invited successfully',
        data: populatedMembership,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/organizations/:id/members/:userId
   */
  async updateMemberRole(req, res, next) {
    try {
      const { role } = req.body;
      const { id: organizationId, userId: targetUserId } = req.params;
      const currentUserId = req.user._id;

      // 1. Check if the current user has permission to change roles
      const currentUserMembership = await Membership.findOne({
        organization: organizationId,
        user: currentUserId,
      });

      if (!currentUserMembership) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this organization',
        });
      }

      // 2. Only owner and manager can change roles
      if (!['owner', 'manager'].includes(currentUserMembership.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only owners and managers can change member roles',
        });
      }

      // 3. Users cannot change their own role
      if (currentUserId.toString() === targetUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You cannot change your own role',
        });
      }

      // 4. Get the target user's membership
      const targetMembership = await Membership.findOne({
        organization: organizationId,
        user: targetUserId,
      });

      if (!targetMembership) {
        return res.status(404).json({
          success: false,
          message: 'Member not found',
        });
      }

      // 5. Cannot change owner's role
      if (targetMembership.role === 'owner') {
        return res.status(403).json({
          success: false,
          message: "Cannot change the owner's role",
        });
      }

      // 6. Managers can only change viewer and editor roles
      if (currentUserMembership.role === 'manager' && targetMembership.role === 'manager') {
        return res.status(403).json({
          success: false,
          message: "Managers cannot change other managers' roles",
        });
      }

      // 7. Only owner can promote to manager
      if (role === 'manager' && currentUserMembership.role !== 'owner') {
        return res.status(403).json({
          success: false,
          message: 'Only owners can promote members to manager',
        });
      }

      // 8. Cannot demote to owner (only transfer ownership - separate action)
      if (role === 'owner') {
        return res.status(403).json({
          success: false,
          message: 'Cannot promote to owner. Use transfer ownership instead.',
        });
      }

      // 9. Update the role
      targetMembership.role = role;
      targetMembership.permissions = []; // Reset permissions, will be set by pre-save hook
      await targetMembership.save();

      const updatedMembership = await Membership.findById(targetMembership._id)
        .populate('user', 'name email avatar');

      res.json({
        success: true,
        message: 'Member role updated',
        data: updatedMembership,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/organizations/:id/members/:userId
   */
  async removeMember(req, res, next) {
    try {
      const { id: organizationId, userId: targetUserId } = req.params;
      const currentUserId = req.user._id;

      // 1. Check if the current user has permission
      const currentUserMembership = await Membership.findOne({
        organization: organizationId,
        user: currentUserId,
      });

      if (!currentUserMembership) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this organization',
        });
      }

      // 2. Get target membership
      const targetMembership = await Membership.findOne({
        organization: organizationId,
        user: targetUserId,
      });

      if (!targetMembership) {
        return res.status(404).json({
          success: false,
          message: 'Member not found',
        });
      }

      // 3. Cannot remove owner
      if (targetMembership.role === 'owner') {
        return res.status(403).json({
          success: false,
          message: 'Cannot remove the organization owner',
        });
      }

      // 4. Users can leave themselves (except owner)
      const isSelf = currentUserId.toString() === targetUserId.toString();
      
      if (isSelf) {
        // Self-removal (leaving)
        await Membership.deleteOne({
          organization: organizationId,
          user: targetUserId,
        });

        return res.json({
          success: true,
          message: 'You have left the organization',
        });
      }

      // 5. Only owner and manager can remove others
      if (!['owner', 'manager'].includes(currentUserMembership.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only owners and managers can remove members',
        });
      }

      // 6. Managers cannot remove other managers
      if (currentUserMembership.role === 'manager' && targetMembership.role === 'manager') {
        return res.status(403).json({
          success: false,
          message: 'Managers cannot remove other managers',
        });
      }

      // 7. Remove the member
      await Membership.deleteOne({
        organization: organizationId,
        user: targetUserId,
      });

      res.json({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrganizationController();
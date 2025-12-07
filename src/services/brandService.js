const Brand = require('../models/Brand');
const Membership = require('../models/Membership');
const Channel = require('../models/Channel');
const emailService = require('./emailService');
const crypto = require('crypto');
const logger = require('../utils/logger');

class BrandService {
  /**
   * Create new brand
   */
  async createBrand(userId, data) {
    const { name, organizationId, description, settings, logo, website } = data;

    // Check if brand name exists in organization
    const existing = await Brand.findOne({
      organization: organizationId,
      name,
    });

    if (existing) {
      throw new Error('Brand name already exists in this organization');
    }

    // Create brand
    const brand = await Brand.create({
      name,
      organization: organizationId,
      description,
      logo,
      website,
      settings: settings || {},
    });

    // Add creator as owner
    await Membership.create({
      user: userId,
      brand: brand._id,
      organization: organizationId,
      role: 'owner',
    });

    return brand;
  }

  /**
   * Get user's brands
   */
  async getUserBrands(userId) {
    const memberships = await Membership.find({ user: userId })
      .populate('brand')
      .populate('organization', 'name slug');

    // Add connected platforms to each brand
    const brandsWithPlatforms = await Promise.all(
      memberships
        .filter(m => m.brand && m.brand.status === 'active')
        .map(async (m) => {
          // Get connected channels for this brand
          const channels = await Channel.find({
            brand: m.brand._id,
            connectionStatus: 'active',
          }).select('provider');

          const connectedPlatforms = [...new Set(channels.map(ch => ch.provider))];

          return {
            ...m.brand.toObject(),
            role: m.role,
            permissions: m.permissions,
            organization: m.organization,
            connectedPlatforms,
            channelCount: channels.length,
          };
        })
    );

    return brandsWithPlatforms;
  }

  /**
   * Get brand by ID with permission check
   */
  async getBrandById(brandId, userId) {
    const brand = await Brand.findById(brandId).populate('organization', 'name slug');

    if (!brand || brand.status === 'deleted') {
      throw new Error('Brand not found');
    }

    // Check user access
    const membership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    if (!membership) {
      throw new Error('Access denied');
    }

    // GET CONNECTED CHANNELS
    const channels = await Channel.find({
      brand: brandId,
      connectionStatus: 'active',
    }).select('provider');

    const connectedPlatforms = [...new Set(channels.map(ch => ch.provider))];

    return {
      ...brand.toObject(),
      role: membership.role,
      permissions: membership.permissions,
      connectedPlatforms,
      channelCount: channels.length,
    };
  }

  /**
   * Update brand
   */
  async updateBrand(brandId, userId, data) {
    const brand = await Brand.findById(brandId);

    if (!brand || brand.status === 'deleted') {
      throw new Error('Brand not found');
    }

    // Check permission
    const membership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    if (!membership || !membership.hasPermission('manage_brand')) {
      throw new Error('Permission denied');
    }

    const allowedUpdates = ['name', 'description', 'logo', 'website', 'settings', 'branding'];
    Object.keys(data).forEach(key => {
      if (allowedUpdates.includes(key)) {
        brand[key] = data[key];
      }
    });

    await brand.save();
    return brand;
  }

  /**
   * Delete brand (soft delete)
   */
  async deleteBrand(brandId, userId) {
    const brand = await Brand.findById(brandId);

    if (!brand) {
      throw new Error('Brand not found');
    }

    // Check permission
    const membership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    if (!membership || !membership.hasPermission('delete_brand')) {
      throw new Error('Permission denied');
    }

    await brand.softDelete();
    return { success: true };
  }

  /**
   * Get brand members
   */
  async getBrandMembers(brandId, userId) {
    // Check access
    const membership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    if (!membership) {
      throw new Error('Access denied');
    }

    const members = await Membership.find({ brand: brandId })
      .populate('user', 'name email avatar')
      .populate('invitedBy', 'name email');

    return members.map(m => ({
      id: m._id,
      user: m.user,
      role: m.role,
      permissions: m.permissions,
      invitedBy: m.invitedBy,
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
      status: m.status,
    }));
  }

  /**
   * Invite member to brand
   */
  async inviteMember(brandId, inviterId, data) {
    const { email, role } = data;

    // Check inviter permission
    const inviterMembership = await Membership.findOne({
      user: inviterId,
      brand: brandId,
    });

    if (!inviterMembership || !inviterMembership.hasPermission('invite_members')) {
      throw new Error('Permission denied');
    }

    const brand = await Brand.findById(brandId).populate('organization');
    if (!brand) {
      throw new Error('Brand not found');
    }

    // Check if user exists
    const User = require('../models/User');
    let user = await User.findOne({ email: email.toLowerCase() });

    // Generate invitation token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenExpires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    if (!user) {
      // Create pending user
      user = await User.create({
        email: email.toLowerCase(),
        name: email.split('@')[0],
        status: 'pending',
        invitationToken: inviteToken,
        invitationTokenExpires: inviteTokenExpires,
        emailVerified: false,
      });
    } else {
      // User exists, update invitation token
      user.invitationToken = inviteToken;
      user.invitationTokenExpires = inviteTokenExpires;
      await user.save();
    }

    // Check if membership already exists
    const existing = await Membership.findOne({
      user: user._id,
      brand: brandId,
    });

    if (existing) {
      throw new Error('User is already a member of this brand');
    }

    // Create membership
    const membership = await Membership.create({
      user: user._id,
      brand: brandId,
      organization: brand.organization._id,
      role: role || 'viewer',
      invitedBy: inviterId,
      status: user.status === 'pending' ? 'pending' : 'active',
    });

    // Send invitation email
    const inviter = await User.findById(inviterId);
    await emailService.sendTeamInvitationEmail(
      email,
      inviter.name,
      brand.name,
      inviteToken
    );

    return membership;
  }

  /**
   * Update member role
   */
  async updateMemberRole(brandId, userId, memberId, newRole) {
    // Check permission
    const userMembership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    if (!userMembership || !userMembership.hasPermission('manage_members')) {
      throw new Error('Permission denied');
    }

    const membership = await Membership.findOne({
      _id: memberId,
      brand: brandId,
    });

    if (!membership) {
      throw new Error('Membership not found');
    }

    // Prevent changing own role
    if (membership.user.toString() === userId.toString()) {
      throw new Error('Cannot change your own role');
    }

    membership.role = newRole;
    membership.permissions = [];
    await membership.save();

    return membership;
  }

  /**
   * Remove member from brand
   */
  async removeMember(brandId, userId, memberId) {
    // Check permission
    const userMembership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    if (!userMembership || !userMembership.hasPermission('manage_members')) {
      throw new Error('Permission denied');
    }

    const membership = await Membership.findOne({
      _id: memberId,
      brand: brandId,
    });

    if (!membership) {
      throw new Error('Membership not found');
    }

    // Prevent removing owner
    if (membership.role === 'owner') {
      throw new Error('Cannot remove brand owner');
    }

    // Prevent removing self
    if (membership.user.toString() === userId.toString()) {
      throw new Error('Cannot remove yourself');
    }

    await membership.deleteOne();
    return { success: true };
  }
}

module.exports = new BrandService();
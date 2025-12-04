const Organization = require('../models/Organization');
const Brand = require('../models/Brand');
const Membership = require('../models/Membership');
const logger = require('../utils/logger');

class OrganizationService {
  /**
   * Create new organization
   */
  async createOrganization(userId, data) {
    const { name, description, settings } = data;

    // Check if organization name already exists
    const existing = await Organization.findOne({ name });
    if (existing) {
      throw new Error('Organization name already exists');
    }

    // Create organization
    const organization = await Organization.create({
      name,
      description,
      owner: userId,
      settings: settings || {},
    });

    // Create default brand with description
    const defaultBrand = await Brand.create({
      name: `${name} - Main`,
      organization: organization._id,
      description: description || `Main brand for ${name}`,
      website: '',
    });

    // Add owner as member with owner role
    await Membership.create({
      user: userId,
      brand: defaultBrand._id,
      organization: organization._id,
      role: 'owner',
    });

    return { organization, defaultBrand };
  }

  /**
   * Get user's organizations with role information
   */
  async getUserOrganizations(userId) {
    const memberships = await Membership.find({ user: userId })
      .populate('organization')
      .populate('brand');

    // Group by organization and include user's role
    const orgMap = new Map();

    for (const membership of memberships) {
      if (!membership.organization) continue;

      const orgId = membership.organization._id.toString();

      if (!orgMap.has(orgId)) {
        orgMap.set(orgId, {
          ...membership.organization.toObject(),
          role: membership.role, // Include user's role in the organization
          permissions: membership.permissions,
          brands: [],
        });
      }

      // If membership has brand, add it
      if (membership.brand) {
        const org = orgMap.get(orgId);
        org.brands.push({
          ...membership.brand.toObject(),
          role: membership.role,
          permissions: membership.permissions,
        });
      }
    }

    return Array.from(orgMap.values());
  }

  /**
   * Update organization
   */
  async updateOrganization(organizationId, userId, data) {
    const organization = await Organization.findById(organizationId);

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Check if user is owner or has permission
    const membership = await Membership.findOne({
      user: userId,
      organization: organizationId,
    });

    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      throw new Error('Permission denied');
    }

    // Update organization
    const { name, description, settings } = data;

    if (name) organization.name = name;
    if (description !== undefined) organization.description = description;
    if (settings) organization.settings = { ...organization.settings, ...settings };

    await organization.save();

    return organization;
  }

  /**
   * Delete organization (soft delete)
   */
  async deleteOrganization(organizationId, userId) {
    const organization = await Organization.findById(organizationId);

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Only owner can delete
    if (organization.owner.toString() !== userId.toString()) {
      throw new Error('Only the owner can delete the organization');
    }

    // Soft delete
    organization.status = 'deleted';
    await organization.save();

    // Also soft delete all brands under this organization
    await Brand.updateMany(
      { organization: organizationId },
      { status: 'deleted', deletedAt: new Date() }
    );

    return organization;
  }
}

module.exports = new OrganizationService();
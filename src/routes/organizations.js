const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const brandController = require('../controllers/brandController');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

/**
 * @swagger
 * tags:
 *   name: Organizations
 *   description: Organization management
 */

// CREATE ORGANIZATION
router.post('/', organizationController.createOrganization);

// GET ALL USER ORGANIZATIONS
router.get('/', organizationController.getUserOrganizations);

// UPDATE ORGANIZATION
router.patch('/:id', organizationController.updateOrganization);

// DELETE ORGANIZATION
router.delete('/:id', organizationController.deleteOrganization);

// ========== BRANDS UNDER ORGANIZATION ==========
// GET BRANDS FOR AN ORGANIZATION
router.get('/:id/brands', brandController.getOrganizationBrands);

// CREATE BRAND UNDER ORGANIZATION
router.post('/:id/brands', brandController.createBrandUnderOrganization);

// ========== MEMBERS MANAGEMENT ==========
// GET ORGANIZATION MEMBERS
router.get('/:id/members', organizationController.getMembers);

// INVITE MEMBER TO ORGANIZATION
router.post('/:id/members', organizationController.inviteMember);

// UPDATE MEMBER ROLE
router.put('/:id/members/:userId', organizationController.updateMemberRole);

// REMOVE MEMBER
router.delete('/:id/members/:userId', organizationController.removeMember);

module.exports = router;
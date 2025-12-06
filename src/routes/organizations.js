const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const brandController = require('../controllers/brandController');
const { requireAuth } = require('../middlewares/auth');
const { validateObjectId, sanitizeQuery } = require('../middlewares/validateInput');

router.use(requireAuth);
router.use(sanitizeQuery);

// CREATE ORGANIZATION (no ID validation)
router.post('/', organizationController.createOrganization);

// GET ALL USER ORGANIZATIONS (query sanitization applied)
router.get('/', organizationController.getUserOrganizations);

// Validate :id parameter
router.patch('/:id', validateObjectId('id'), organizationController.updateOrganization);

// Validate :id parameter
router.delete('/:id', validateObjectId('id'), organizationController.deleteOrganization);

// ========== BRANDS UNDER ORGANIZATION ==========
// Validate :id parameter
router.get('/:id/brands', validateObjectId('id'), brandController.getOrganizationBrands);

// Validate :id parameter
router.post('/:id/brands', validateObjectId('id'), brandController.createBrandUnderOrganization);

// ========== MEMBERS MANAGEMENT ==========
// Validate :id parameter
router.get('/:id/members', validateObjectId('id'), organizationController.getMembers);

// Validate :id parameter
router.post('/:id/members', validateObjectId('id'), organizationController.inviteMember);

// Validate both :id and :userId
router.put(
  '/:id/members/:userId',
  validateObjectId('id'),
  validateObjectId('userId'),
  organizationController.updateMemberRole
);

// Validate both :id and :userId
router.delete(
  '/:id/members/:userId',
  validateObjectId('id'),
  validateObjectId('userId'),
  organizationController.removeMember
);

module.exports = router;
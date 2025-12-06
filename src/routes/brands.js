const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const { requireAuth } = require('../middlewares/auth');
const { validateObjectId, sanitizeQuery } = require('../middlewares/validateInput');

router.use(requireAuth);
router.use(sanitizeQuery); // Sanitize query params

// CREATE BRAND (no ID validation)
router.post('/', brandController.createBrand);

// GET ALL USER BRANDS (query sanitization applied)
router.get('/', brandController.getUserBrands);

// Validate :brandId parameter
router.get('/:brandId', validateObjectId('brandId'), brandController.getBrandById);

// Validate :brandId parameter
router.patch('/:brandId', validateObjectId('brandId'), brandController.updateBrand);

// Validate :brandId parameter
router.delete('/:brandId', validateObjectId('brandId'), brandController.deleteBrand);

// ========== TEAM MANAGEMENT ==========
// alidate :brandId parameter
router.get('/:brandId/members', validateObjectId('brandId'), brandController.getBrandMembers);

// Validate :brandId parameter
router.post('/:brandId/members', validateObjectId('brandId'), brandController.inviteMember);

// Validate both :brandId and :memberId
router.patch(
  '/:brandId/members/:memberId',
  validateObjectId('brandId'),
  validateObjectId('memberId'),
  brandController.updateMemberRole
);

// Validate both :brandId and :memberId
router.delete(
  '/:brandId/members/:memberId',
  validateObjectId('brandId'),
  validateObjectId('memberId'),
  brandController.removeMember
);

module.exports = router;
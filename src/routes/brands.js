const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

/**
 * @swagger
 * tags:
 *   name: Brands
 *   description: Brand management
 */

// CREATE BRAND
router.post('/', brandController.createBrand);

// GET ALL USER BRANDS
router.get('/', brandController.getUserBrands);

// GET SINGLE BRAND (use :brandId instead of :id to avoid conflicts)
router.get('/:brandId', brandController.getBrandById);

// UPDATE BRAND
router.patch('/:brandId', brandController.updateBrand);

// DELETE BRAND
router.delete('/:brandId', brandController.deleteBrand);

// ========== TEAM MANAGEMENT ==========
// GET BRAND MEMBERS
router.get('/:brandId/members', brandController.getBrandMembers);

// INVITE MEMBER
router.post('/:brandId/members', brandController.inviteMember);

// UPDATE MEMBER ROLE
router.patch('/:brandId/members/:memberId', brandController.updateMemberRole);

// REMOVE MEMBER
router.delete('/:brandId/members/:memberId', brandController.removeMember);

module.exports = router;
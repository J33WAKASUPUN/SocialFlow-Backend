const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const { requireAuth } = require('../middlewares/auth');
const { uploadMedia } = require('../middlewares/upload');

// All routes require authentication
router.use(requireAuth);

/**
 * @route   POST /api/v1/media/upload
 * @desc    Upload media files
 * @access  Private
 */
router.post('/upload', uploadMedia, mediaController.uploadMedia);

/**
 * @route   GET /api/v1/media
 * @desc    Get media library with filters
 * @access  Private
 */
router.get('/', mediaController.getMediaLibrary);

// ============================================
// STATIC ROUTES MUST COME BEFORE DYNAMIC ROUTES (:id)
// ============================================

/**
 * @route   GET /api/v1/media/for-post
 * @desc    Get media formatted for post composer
 * @access  Private
 */
router.get('/for-post', mediaController.getMediaForPostComposer);

/**
 * @route   GET /api/v1/media/folders
 * @desc    Get all folders for a brand
 * @access  Private
 */
router.get('/folders', mediaController.getFolders);

/**
 * @route   GET /api/v1/media/folders-metadata
 * @desc    Get folders with metadata
 * @access  Private
 * MUST BE BEFORE /:id ROUTE
 */
router.get('/folders-metadata', mediaController.getFoldersMetadata);

/**
 * @route   GET /api/v1/media/tags
 * @desc    Get popular tags
 * @access  Private
 */
router.get('/tags', mediaController.getPopularTags);

/**
 * @route   GET /api/v1/media/stats
 * @desc    Get storage statistics
 * @access  Private
 */
router.get('/stats', mediaController.getStorageStats);

// ============================================
// DYNAMIC ROUTES COME AFTER STATIC ROUTES
// ============================================

/**
 * @route   GET /api/v1/media/:id
 * @desc    Get single media by ID
 * @access  Private
 */
router.get('/:id', mediaController.getMediaById);

/**
 * @route   PATCH /api/v1/media/:id
 * @desc    Update media metadata
 * @access  Private
 */
router.patch('/:id', mediaController.updateMedia);

/**
 * @route   DELETE /api/v1/media/:id
 * @desc    Delete media
 * @access  Private
 */
router.delete('/:id', mediaController.deleteMedia);

// ============================================
// FOLDER MANAGEMENT ROUTES
// ============================================

/**
 * @route   POST /api/v1/media/folders
 * @desc    Create new folder
 * @access  Private
 */
router.post('/folders', mediaController.createFolder);

/**
 * @route   PATCH /api/v1/media/folders/:folderName
 * @desc    Rename folder
 * @access  Private
 */
router.patch('/folders/:folderName', mediaController.renameFolder);

/**
 * @route   DELETE /api/v1/media/folders/:folderName
 * @desc    Delete folder
 * @access  Private
 */
router.delete('/folders/:folderName', mediaController.deleteFolder);

/**
 * @route   POST /api/v1/media/move-to-folder
 * @desc    Move media to folder
 * @access  Private
 */
router.post('/move-to-folder', mediaController.moveToFolder);

/**
 * @route   POST /api/v1/media/bulk-delete
 * @desc    Bulk delete media
 * @access  Private
 */
router.post('/bulk-delete', mediaController.bulkDeleteMedia);

module.exports = router;
const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const { requireAuth } = require('../middlewares/auth');
const { validateObjectId, sanitizeQuery } = require('../middlewares/validateInput');
const { uploadMedia } = require('../middlewares/upload');

router.use(requireAuth);
router.use(sanitizeQuery); // ✅ ADD: Sanitize query params

// UPLOAD (no ID validation)
router.post('/upload', uploadMedia, mediaController.uploadMedia);

// GET LIBRARY (query sanitization applied)
router.get('/', mediaController.getMediaLibrary);

// STATIC ROUTES (no ID validation)
router.get('/for-post', mediaController.getMediaForPostComposer);
router.get('/folders', mediaController.getFolders);
router.get('/folders-metadata', mediaController.getFoldersMetadata);
router.get('/tags', mediaController.getPopularTags);
router.get('/stats', mediaController.getStorageStats);

// Validate :id parameter for media-specific routes
router.get('/:id', validateObjectId('id'), mediaController.getMediaById);
router.patch('/:id', validateObjectId('id'), mediaController.updateMedia);
router.delete('/:id', validateObjectId('id'), mediaController.deleteMedia);

// BULK DELETE (validate array of IDs in controller)
router.post('/bulk-delete', mediaController.bulkDeleteMedia);

// FOLDER MANAGEMENT (folder names are strings, not ObjectIds)
router.post('/folders', mediaController.createFolder);
router.patch('/folders/:folderName', mediaController.renameFolder);
router.delete('/folders/:folderName', mediaController.deleteFolder);
router.post('/move-to-folder', mediaController.moveToFolder);

module.exports = router;
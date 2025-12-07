const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { requireAuth } = require('../middlewares/auth');
const { validateObjectId, sanitizeQuery } = require('../middlewares/validateInput');
const { uploadMedia } = require('../middlewares/upload');

router.use(requireAuth);
router.use(sanitizeQuery); // Sanitize all query params

// CREATE POST (no ID validation needed)
router.post('/', postController.createPost);

// GET POSTS (apply query sanitization)
router.get('/', postController.getPosts);

// CALENDAR (apply query sanitization)
router.get('/calendar', postController.getCalendar);

// Validate :id parameter
router.get('/:id', validateObjectId('id'), postController.getPostById);

// Validate :id parameter
router.patch('/:id', validateObjectId('id'), postController.updatePost);

// Validate :id parameter
router.delete('/:id', validateObjectId('id'), postController.deletePost);

// Validate :id parameter
router.post('/:id/schedule', validateObjectId('id'), postController.schedulePost);

// Validate both :postId and :scheduleId
router.delete(
  '/:postId/schedules/:scheduleId',
  validateObjectId('postId'),
  validateObjectId('scheduleId'),
  postController.cancelSchedule
);

module.exports = router;
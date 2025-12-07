const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middlewares/auth');
const { validateObjectId, sanitizeQuery } = require('../middlewares/validateInput');

router.use(requireAuth);
router.use(sanitizeQuery); // Sanitize query params

// GET NOTIFICATIONS (query sanitization applied)
router.get('/', notificationController.getNotifications);

// GET UNREAD COUNT (no ID validation)
router.get('/unread-count', notificationController.getUnreadCount);

// MARK ALL AS READ (no ID validation)
router.patch('/read-all', notificationController.markAllAsRead);

// Validate :id parameter
router.patch('/:id/read', validateObjectId('id'), notificationController.markAsRead);

// Validate :id parameter
router.delete('/:id', validateObjectId('id'), notificationController.deleteNotification);

// TEST ENDPOINT (development only)
if (process.env.NODE_ENV === 'development') {
  router.post('/test', notificationController.createTestNotification);
}

module.exports = router;
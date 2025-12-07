const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const whatsappWebhookController = require('../controllers/whatsappWebhookController');
const { requireAuth } = require('../middlewares/auth');
const { validateObjectId, sanitizeQuery } = require('../middlewares/validateInput');

// ============================================
// WEBHOOK ROUTES (NO AUTH REQUIRED) 
// ============================================

// GET webhook verification (Meta's initial handshake)
router.get('/webhook', whatsappWebhookController.verifyWebhook);

// POST webhook events (incoming messages and status updates)
router.post('/webhook', whatsappWebhookController.handleIncomingWebhook);

// ============================================
// API ROUTES (AUTH REQUIRED)
// ============================================

router.use(requireAuth);
router.use(sanitizeQuery);

// CONNECTION
router.post('/connect', whatsappController.connectAccount);

// TEMPLATES
router.get('/templates', whatsappController.getTemplates);
router.post('/templates', whatsappController.createTemplate);
router.delete('/templates/:id', validateObjectId('id'), whatsappController.deleteTemplate);

// CONTACTS
router.get('/contacts', whatsappController.getContacts);
router.post('/contacts', whatsappController.createContact);
router.patch('/contacts/:id', validateObjectId('id'), whatsappController.updateContact);
router.delete('/contacts/:id', validateObjectId('id'), whatsappController.deleteContact);

// MESSAGING
router.post('/send-template', whatsappController.sendTemplateMessage);

// MESSAGE HISTORY
router.get('/messages', async (req, res, next) => {
  try {
    const { brandId, phoneNumberId, limit = 50, page = 1 } = req.query;

    if (!brandId && !phoneNumberId) {
      return res.status(400).json({
        success: false,
        message: 'brandId or phoneNumberId is required',
      });
    }

    const WhatsAppMessage = require('../models/WhatsAppMessage');

    const query = {};
    if (brandId) query.brand = brandId;
    if (phoneNumberId) query.phoneNumberId = phoneNumberId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      WhatsAppMessage.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      WhatsAppMessage.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
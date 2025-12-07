const logger = require('../utils/logger');
const whatsappWebhookService = require('../services/whatsappWebhookService');

class WhatsAppWebhookController {
  /**
   * GET /api/v1/whatsapp/webhook
   * Verify webhook (Meta's initial handshake)
   */
  async verifyWebhook(req, res, next) {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      logger.info('📞 WhatsApp webhook verification request', {
        mode,
        hasToken: !!token,
        hasChallenge: !!challenge,
      });

      // Verify the request
      if (mode && token) {
        if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
          logger.info('✅ WhatsApp webhook verified successfully');
          return res.status(200).send(challenge);
        } else {
          logger.warn('⚠️ WhatsApp webhook verification failed - invalid token');
          return res.sendStatus(403);
        }
      }

      logger.warn('⚠️ WhatsApp webhook verification failed - missing parameters');
      res.sendStatus(400);
    } catch (error) {
      logger.error('❌ WhatsApp webhook verification error', {
        message: error.message,
        stack: error.stack,
      });
      next(error);
    }
  }

  /**
   * POST /api/v1/whatsapp/webhook
   * Handle incoming webhook events from WhatsApp
   */
  async handleIncomingWebhook(req, res, next) {
    try {
      const body = req.body;

      logger.info('📨 WhatsApp webhook received', {
        object: body.object,
        hasEntry: !!body.entry,
      });

      // Acknowledge receipt immediately
      res.sendStatus(200);

      // Verify the webhook object type
      if (body.object !== 'whatsapp_business_account') {
        logger.warn('⚠️ Invalid webhook object type', { object: body.object });
        return;
      }

      // Process each entry
      if (!body.entry || body.entry.length === 0) {
        logger.warn('⚠️ No entries in webhook payload');
        return;
      }

      for (const entry of body.entry) {
        // Each entry can have multiple changes
        if (!entry.changes || entry.changes.length === 0) {
          continue;
        }

        for (const change of entry.changes) {
          if (change.field !== 'messages') {
            continue;
          }

          const value = change.value;

          // Process incoming messages
          if (value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
              await whatsappWebhookService.handleIncomingMessage({
                from: message.from,
                messageId: message.id,
                timestamp: message.timestamp,
                type: message.type,
                text: message.text?.body,
                image: message.image,
                video: message.video,
                audio: message.audio,
                document: message.document,
                contacts: value.contacts,
                metadata: value.metadata,
              });
            }
          }

          // Process message status updates
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              await whatsappWebhookService.handleMessageStatus({
                messageId: status.id,
                recipientId: status.recipient_id,
                status: status.status, // sent, delivered, read, failed
                timestamp: status.timestamp,
                errors: status.errors,
              });
            }
          }
        }
      }

      logger.info('✅ WhatsApp webhook processed successfully');
    } catch (error) {
      logger.error('❌ WhatsApp webhook processing error', {
        message: error.message,
        stack: error.stack,
        body: req.body,
      });
      // Don't call next(error) - already sent 200 response
    }
  }
}

module.exports = new WhatsAppWebhookController();
const logger = require('../utils/logger');
const whatsappWebhookService = require('../services/whatsappWebhookService');

class WhatsAppWebhookController {
  /**
   * GET /api/v1/whatsapp/webhook
   * Verify webhook (Meta's initial handshake)
   */
  async verifyWebhook(req, res, next) {
    try {
      logger.info('🔍 Raw Query received:', req.query);

      const hub = req.query.hub || {};
      
      const mode = hub.mode || req.query['hub.mode'];
      const token = hub.verify_token || req.query['hub.verify_token'];
      const challenge = hub.challenge || req.query['hub.challenge'];

      logger.info('📞 WhatsApp Verification Data:', {
        mode,
        token: token ? '***' : undefined,
        challenge
      });

      if (mode && token) {
        if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
          logger.info('✅ WhatsApp webhook verified successfully');
          return res.status(200).send(challenge.toString());
        } else {
          logger.warn('⚠️ WhatsApp webhook verification failed - invalid token');
          return res.sendStatus(403);
        }
      }

      logger.warn('⚠️ Missing parameters', { mode, token, challenge });
      res.sendStatus(400);
    } catch (error) {
      logger.error('❌ Verification Error', { message: error.message });
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

      // ✅ Acknowledge receipt immediately (CRITICAL for Meta)
      res.sendStatus(200);

      if (body.object !== 'whatsapp_business_account') {
        logger.warn('⚠️ Invalid webhook object type', { object: body.object });
        return;
      }

      if (!body.entry || body.entry.length === 0) {
        logger.warn('⚠️ No entries in webhook payload');
        return;
      }

      // ✅ Process each entry
      for (const entry of body.entry) {
        if (!entry.changes || entry.changes.length === 0) {
          continue;
        }

        for (const change of entry.changes) {
          const field = change.field;
          const value = change.value;

          logger.info(`📥 Processing webhook field: ${field}`);

          // ✅ Route based on field type
          switch (field) {
            case 'messages':
              await this.handleMessagesField(value);
              break;

            case 'message_template_status_update':
              await whatsappWebhookService.handleTemplateStatusUpdate(value);
              break;

            case 'phone_number_quality_update':
              await whatsappWebhookService.handleQualityUpdate(value);
              break;

            case 'message_echoes':
              await whatsappWebhookService.handleMessageEcho(value);
              break;

            default:
              logger.warn(`⚠️ Unhandled webhook field: ${field}`, { value });
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
    }
  }

  /**
   * Handle messages field (incoming messages, statuses, calls)
   */
  async handleMessagesField(value) {
    // ✅ 1. Handle incoming messages
    if (value.messages && value.messages.length > 0) {
      for (const message of value.messages) {
        // ✅ Check if it's a call
        if (message.type === 'call_log') {
          await whatsappWebhookService.handleCallLog({
            from: message.from,
            callId: message.call_log.id,
            timestamp: message.timestamp,
            callStatus: message.call_log.status, // missed, rejected, accepted
            videoCall: message.call_log.video || false,
            metadata: value.metadata,
          });
        } else {
          // Regular message
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
    }

    // ✅ 2. Handle message status updates
    if (value.statuses && value.statuses.length > 0) {
      for (const status of value.statuses) {
        await whatsappWebhookService.handleMessageStatus({
          messageId: status.id,
          recipientId: status.recipient_id,
          status: status.status,
          timestamp: status.timestamp,
          errors: status.errors,
        });
      }
    }
  }
}

module.exports = new WhatsAppWebhookController();
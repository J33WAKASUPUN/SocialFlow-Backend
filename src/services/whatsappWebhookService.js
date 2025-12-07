const WhatsAppContact = require('../models/WhatsAppContact');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

class WhatsAppWebhookService {
  /**
   * Handle incoming message
   */
  async handleIncomingMessage(data) {
    try {
      const { from, messageId, timestamp, type, text, image, video, audio, document, contacts, metadata } = data;

      logger.info('📩 Processing incoming WhatsApp message', {
        from,
        messageId,
        type,
        text: text?.substring(0, 50),
      });

      // Find or create contact
      const phoneNumberId = metadata?.phone_number_id;
      const displayPhoneNumber = metadata?.display_phone_number;

      let contact = await WhatsAppContact.findOne({ phone: from });

      if (!contact) {
        // Try to get contact name from the contacts array
        const contactInfo = contacts?.find(c => c.wa_id === from);
        
        logger.info('📇 Creating new WhatsApp contact', {
          from,
          name: contactInfo?.profile?.name || 'Unknown',
        });

        // Create new contact (you'll need to determine the brand based on phoneNumberId)
        // For now, we'll log it and handle it later
        logger.warn('⚠️ New contact from unknown brand', {
          from,
          phoneNumberId,
          displayPhoneNumber,
        });
      }

      // Save message to database
      const message = await WhatsAppMessage.create({
        messageId,
        from,
        to: displayPhoneNumber,
        phoneNumberId,
        timestamp: new Date(parseInt(timestamp) * 1000),
        type,
        direction: 'inbound',
        status: 'received',
        content: {
          text,
          image,
          video,
          audio,
          document,
        },
        metadata: {
          displayPhoneNumber,
          phoneNumberId,
        },
      });

      logger.info('✅ WhatsApp message saved', {
        messageId: message._id,
        from,
        type,
      });

      // TODO: Implement auto-reply logic here if needed
      // TODO: Notify relevant users about new message

      return message;
    } catch (error) {
      logger.error('❌ Failed to process incoming message', {
        error: error.message,
        from: data.from,
        messageId: data.messageId,
      });
      throw error;
    }
  }

  /**
   * Handle message status update
   */
  async handleMessageStatus(data) {
    try {
      const { messageId, recipientId, status, timestamp, errors } = data;

      logger.info('📊 Processing WhatsApp message status', {
        messageId,
        recipientId,
        status,
      });

      // Update message status in database
      const message = await WhatsAppMessage.findOneAndUpdate(
        { messageId },
        {
          status,
          lastStatusUpdate: new Date(parseInt(timestamp) * 1000),
          ...(errors && { errors }),
        },
        { new: true }
      );

      if (!message) {
        logger.warn('⚠️ Message not found for status update', { messageId });
        return;
      }

      logger.info('✅ Message status updated', {
        messageId: message._id,
        status,
      });

      // Notify user if message failed
      if (status === 'failed' && errors) {
        // TODO: Create notification for failed message
        logger.error('❌ WhatsApp message failed', {
          messageId,
          recipientId,
          errors,
        });
      }

      return message;
    } catch (error) {
      logger.error('❌ Failed to process message status', {
        error: error.message,
        messageId: data.messageId,
      });
      throw error;
    }
  }

  /**
   * Format phone number to E.164
   */
  formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add + prefix if not present
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }
}

module.exports = new WhatsAppWebhookService();
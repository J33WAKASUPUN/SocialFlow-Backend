const WhatsAppContact = require('../models/WhatsAppContact');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Channel = require('../models/Channel');
const WhatsAppAccountHealth = require('../models/WhatsAppAccountHealth');
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
        const contactInfo = contacts?.find(c => c.wa_id === from);
        
        logger.info('📇 Creating new WhatsApp contact', {
          from,
          name: contactInfo?.profile?.name || 'Unknown',
        });

        // Create new contact (determine brand based on phoneNumberId)
        // For now, log it
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

      if (status === 'failed' && errors) {
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
   * ✅ NEW: Handle call logs
   */
  async handleCallLog(data) {
    try {
      const { from, callId, timestamp, callStatus, videoCall, metadata } = data;

      logger.info('📞 Processing WhatsApp call log', {
        from,
        callId,
        callStatus,
        videoCall,
      });

      const phoneNumberId = metadata?.phone_number_id;
      const displayPhoneNumber = metadata?.display_phone_number;

      // Save call log as a message
      const callMessage = await WhatsAppMessage.create({
        messageId: callId,
        from,
        to: displayPhoneNumber,
        phoneNumberId,
        timestamp: new Date(parseInt(timestamp) * 1000),
        type: 'call',
        direction: 'inbound',
        status: 'received',
        content: {
          call: {
            callId,
            callStatus, // missed, rejected, accepted
            videoCall,
          },
        },
        metadata: {
          displayPhoneNumber,
          phoneNumberId,
        },
      });

      logger.info(`✅ Call log saved: ${callStatus}`, {
        callId: callMessage._id,
        from,
        videoCall,
      });

      // ✅ Notify user about missed calls
      if (callStatus === 'missed') {
        // TODO: Create notification
        logger.warn('⚠️ Missed call from', { from });
      }

      return callMessage;
    } catch (error) {
      logger.error('❌ Failed to process call log', {
        error: error.message,
        callId: data.callId,
      });
      throw error;
    }
  }

  /**
   * ✅ NEW: Handle template status updates
   */
  async handleTemplateStatusUpdate(data) {
    try {
      const { message_template_id, message_template_name, message_template_language, event } = data;

      logger.info('📝 Processing template status update', {
        templateName: message_template_name,
        event, // APPROVED, REJECTED, DISABLED
      });

      // Update template status in database
      const template = await WhatsAppTemplate.findOneAndUpdate(
        {
          name: message_template_name,
          language: message_template_language,
        },
        {
          status: event === 'APPROVED' ? 'APPROVED' : 'REJECTED',
          platformTemplateId: message_template_id,
        },
        { new: true }
      );

      if (!template) {
        logger.warn('⚠️ Template not found in database', { message_template_name });
        return;
      }

      logger.info(`✅ Template ${event.toLowerCase()}`, {
        templateId: template._id,
        name: message_template_name,
      });

      // ✅ Notify user
      // TODO: Create notification

      return template;
    } catch (error) {
      logger.error('❌ Failed to process template status update', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * ✅ NEW: Handle phone number quality updates
   */
  async handleQualityUpdate(data) {
    try {
      const { phone_number, quality_score, quality_rating } = data;

      logger.info('📊 Processing quality update', {
        phoneNumber: phone_number,
        qualityRating: quality_rating,
        qualityScore: quality_score,
      });

      // Find channel by phone number
      const channel = await Channel.findOne({
        'providerData.phoneNumberId': phone_number,
        provider: 'whatsapp',
      });

      if (!channel) {
        logger.warn('⚠️ Channel not found for phone number', { phone_number });
        return;
      }

      // Update or create health record
      const healthRecord = await WhatsAppAccountHealth.findOneAndUpdate(
        { channel: channel._id },
        {
          phoneNumberId: phone_number,
          qualityRating: quality_rating,
          qualityScore: quality_score,
          lastUpdated: new Date(),
          $push: {
            history: {
              qualityRating: quality_rating,
              timestamp: new Date(),
            },
          },
        },
        { upsert: true, new: true }
      );

      logger.info('✅ Account health updated', {
        channelId: channel._id,
        qualityRating: quality_rating,
      });

      // ✅ Create alert if quality degraded
      if (quality_rating === 'YELLOW' || quality_rating === 'RED') {
        logger.warn(`⚠️ Account quality degraded to ${quality_rating}`, {
          phoneNumber: phone_number,
          qualityScore: quality_score,
        });

        // TODO: Create notification
      }

      return healthRecord;
    } catch (error) {
      logger.error('❌ Failed to process quality update', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * ✅ NEW: Handle message echoes (replies sent from WhatsApp Business app)
   */
  async handleMessageEcho(data) {
    try {
      const { messages } = data;

      if (!messages || messages.length === 0) return;

      for (const message of messages) {
        logger.info('🔄 Processing message echo', {
          messageId: message.id,
          from: message.from,
        });

        // Save echo as outbound message
        await WhatsAppMessage.create({
          messageId: message.id,
          from: message.from,
          to: message.to,
          phoneNumberId: data.metadata?.phone_number_id,
          timestamp: new Date(parseInt(message.timestamp) * 1000),
          type: message.type,
          direction: 'outbound',
          status: 'sent',
          content: {
            text: message.text?.body,
          },
          metadata: {
            displayPhoneNumber: data.metadata?.display_phone_number,
            phoneNumberId: data.metadata?.phone_number_id,
          },
        });
      }

      logger.info('✅ Message echoes processed');
    } catch (error) {
      logger.error('❌ Failed to process message echoes', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Format phone number to E.164
   */
  formatPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }
}

module.exports = new WhatsAppWebhookService();
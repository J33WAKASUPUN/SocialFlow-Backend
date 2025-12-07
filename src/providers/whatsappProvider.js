const axios = require('axios');
const BaseProvider = require('./baseProvider');
const logger = require('../utils/logger');

class WhatsAppProvider extends BaseProvider {
  getConfig() {
    return {
      apiUrl: 'https://graph.facebook.com/v21.0',
      // WhatsApp uses Facebook's Graph API
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    };
  }

  /**
   * WhatsApp doesn't use traditional OAuth - requires manual setup
   */
  getAuthorizationUrl(state) {
    throw new Error('WhatsApp requires manual configuration via Meta Business Suite');
  }

  /**
   * Configure WhatsApp Business Account
   */
  async handleCallback(config) {
    try {
      const { phoneNumberId, businessAccountId, accessToken } = config;

      // Test connection
      const response = await axios.get(
        `${this.getConfig().apiUrl}/${phoneNumberId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { fields: 'display_phone_number,verified_name,quality_rating' },
        }
      );

      return {
        platformUserId: phoneNumberId,
        platformUsername: response.data.display_phone_number,
        displayName: response.data.verified_name,
        accessToken,
        refreshToken: null, // WhatsApp uses long-lived tokens
        tokenExpiresAt: null,
        providerData: {
          businessAccountId,
          phoneNumberId,
          qualityRating: response.data.quality_rating,
        },
      };
    } catch (error) {
      logger.error('[WHATSAPP] Connection failed', {
        message: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  async refreshAccessToken() {
    // WhatsApp uses long-lived tokens that don't auto-refresh
    logger.warn('[WHATSAPP] Token refresh not supported - use Meta Business Suite to generate new token');
    return false;
  }

  async testConnection() {
    try {
      const config = this.getConfig();
      const accessToken = this.getAccessToken();

      const response = await axios.get(
        `${config.apiUrl}/${this.channel.providerData.phoneNumberId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      logger.info('[WHATSAPP] Connection test successful', {
        phoneNumber: response.data.display_phone_number,
        verified: response.data.verified_name,
      });

      return true;
    } catch (error) {
      logger.error('[WHATSAPP] Connection test failed', {
        message: error.message,
        response: error.response?.data,
      });
      return false;
    }
  }

  /**
   * Send template message to contacts
   */
  async sendTemplateMessage(templateName, languageCode, recipients, components = []) {
    try {
      const config = this.getConfig();
      const accessToken = this.getAccessToken();
      const phoneNumberId = this.channel.providerData.phoneNumberId;

      const results = [];

      for (const recipient of recipients) {
        try {
          const response = await axios.post(
            `${config.apiUrl}/${phoneNumberId}/messages`,
            {
              messaging_product: 'whatsapp',
              to: recipient.phone,
              type: 'template',
              template: {
                name: templateName,
                language: { code: languageCode },
                components: components,
              },
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );

          results.push({
            recipient: recipient.phone,
            success: true,
            messageId: response.data.messages[0].id,
          });

          logger.info('[WHATSAPP] Template sent', {
            recipient: recipient.phone,
            template: templateName,
            messageId: response.data.messages[0].id,
          });

          // Rate limiting: Wait 1 second between messages
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          results.push({
            recipient: recipient.phone,
            success: false,
            error: error.response?.data?.error?.message || error.message,
          });

          logger.error('[WHATSAPP] Template send failed', {
            recipient: recipient.phone,
            error: error.response?.data,
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('[WHATSAPP] Batch send failed', {
        message: error.message,
      });
      throw error;
    }
  }

  /**
   * Get message templates
   */
  async getTemplates() {
    try {
      const config = this.getConfig();
      const accessToken = this.getAccessToken();
      const businessAccountId = this.channel.providerData.businessAccountId;

      const response = await axios.get(
        `${config.apiUrl}/${businessAccountId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            fields: 'name,status,language,category,components',
            limit: 100,
          },
        }
      );

      return response.data.data;
    } catch (error) {
      logger.error('[WHATSAPP] Failed to fetch templates', {
        message: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Create message template
   */
  async createTemplate(templateData) {
    try {
      const config = this.getConfig();
      const accessToken = this.getAccessToken();
      const businessAccountId = this.channel.providerData.businessAccountId;

      const response = await axios.post(
        `${config.apiUrl}/${businessAccountId}/message_templates`,
        {
          name: templateData.name,
          language: templateData.language,
          category: templateData.category,
          components: templateData.components,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info('[WHATSAPP] Template created', {
        templateId: response.data.id,
        name: templateData.name,
      });

      return response.data;
    } catch (error) {
      logger.error('[WHATSAPP] Template creation failed', {
        message: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(templateName) {
    try {
      const config = this.getConfig();
      const accessToken = this.getAccessToken();
      const businessAccountId = this.channel.providerData.businessAccountId;

      await axios.delete(
        `${config.apiUrl}/${businessAccountId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { name: templateName },
        }
      );

      logger.info('[WHATSAPP] Template deleted', { name: templateName });
      return true;
    } catch (error) {
      logger.error('[WHATSAPP] Template deletion failed', {
        message: error.message,
        response: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * NOT SUPPORTED: WhatsApp doesn't support traditional post publishing
   */
  async publish(post) {
    throw new Error('Use sendTemplateMessage() instead of publish() for WhatsApp');
  }

  async updatePost(platformPostId, newContent) {
    throw new Error('WhatsApp messages cannot be edited');
  }

  async deletePost(platformPostId) {
    throw new Error('WhatsApp messages cannot be deleted via API');
  }

  async getPosts(options = {}) {
    throw new Error('WhatsApp does not support retrieving sent messages via API');
  }

  async getPostAnalytics(platformPostId) {
    // WhatsApp provides analytics via Meta Business Suite, not API
    return {
      delivered: null,
      read: null,
      replied: null,
      note: 'Analytics available in Meta Business Suite',
    };
  }
}

module.exports = WhatsAppProvider;
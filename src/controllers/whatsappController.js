const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const WhatsAppContact = require('../models/WhatsAppContact');
const Channel = require('../models/Channel');
const Membership = require('../models/Membership');
const ProviderFactory = require('../providers/ProviderFactory');
const logger = require('../utils/logger');

class WhatsAppController {
  /**
   * POST /api/v1/whatsapp/connect
   * Connect WhatsApp Business Account
   */
  async connectAccount(req, res, next) {
    try {
      const { brandId, phoneNumberId, businessAccountId, accessToken } = req.body;

      if (!phoneNumberId || !businessAccountId || !accessToken) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: phoneNumberId, businessAccountId, accessToken',
        });
      }

      // Check brand access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: brandId,
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Test connection
      const provider = ProviderFactory.getProvider('whatsapp');
      const channelData = await provider.handleCallback({
        phoneNumberId,
        businessAccountId,
        accessToken,
      });

      // Create channel
      const channel = await Channel.create({
        brand: brandId,
        provider: 'whatsapp',
        platformUserId: channelData.platformUserId,
        platformUsername: channelData.platformUsername,
        displayName: channelData.displayName,
        accessToken: channelData.accessToken,
        refreshToken: null,
        tokenExpiresAt: null,
        connectionStatus: 'active',
        providerData: channelData.providerData,
        connectedBy: req.user._id,
      });

      res.json({
        success: true,
        message: 'WhatsApp Business Account connected',
        data: channel,
      });
    } catch (error) {
      logger.error('[WHATSAPP] Connection failed', { error: error.message });
      next(error);
    }
  }

  /**
   * GET /api/v1/whatsapp/templates
   * Get all templates
   */
  async getTemplates(req, res, next) {
    try {
      const { brandId, channelId } = req.query;

      // Check access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: brandId,
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      let templates;

      if (channelId) {
        // Fetch from WhatsApp API
        const channel = await Channel.findById(channelId);
        if (!channel) {
          return res.status(404).json({
            success: false,
            message: 'Channel not found',
          });
        }

        const provider = ProviderFactory.getProvider('whatsapp', channel);
        templates = await provider.getTemplates();
      } else {
        // Fetch from database
        templates = await WhatsAppTemplate.find({ brand: brandId })
          .populate('createdBy', 'name email')
          .sort('-createdAt');
      }

      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      logger.error('[WHATSAPP] Failed to fetch templates', { error: error.message });
      next(error);
    }
  }

  /**
   * POST /api/v1/whatsapp/templates
   * Create template
   */
  async createTemplate(req, res, next) {
    try {
      const { brandId, channelId, name, language, category, components } = req.body;

      // Check access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: brandId,
      });

      if (!membership || !membership.permissions.includes('create_posts')) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
        });
      }

      // Get channel
      const channel = await Channel.findById(channelId);
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: 'Channel not found',
        });
      }

      // Create template via API
      const provider = ProviderFactory.getProvider('whatsapp', channel);
      const result = await provider.createTemplate({
        name,
        language,
        category,
        components,
      });

      // Save to database
      const template = await WhatsAppTemplate.create({
        brand: brandId,
        channel: channelId,
        name,
        language,
        category,
        components,
        platformTemplateId: result.id,
        status: 'PENDING',
        createdBy: req.user._id,
      });

      res.status(201).json({
        success: true,
        message: 'Template created (pending approval)',
        data: template,
      });
    } catch (error) {
      logger.error('[WHATSAPP] Template creation failed', { error: error.message });
      next(error);
    }
  }

  /**
   * DELETE /api/v1/whatsapp/templates/:id
   * Delete template
   */
  async deleteTemplate(req, res, next) {
    try {
      const { id } = req.params;

      const template = await WhatsAppTemplate.findById(id);
      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Template not found',
        });
      }

      // Check access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: template.brand,
      });

      if (!membership || !membership.permissions.includes('create_posts')) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
        });
      }

      // Delete from WhatsApp
      const channel = await Channel.findById(template.channel);
      const provider = ProviderFactory.getProvider('whatsapp', channel);
      await provider.deleteTemplate(template.name);

      // Delete from database
      await template.deleteOne();

      res.json({
        success: true,
        message: 'Template deleted',
      });
    } catch (error) {
      logger.error('[WHATSAPP] Template deletion failed', { error: error.message });
      next(error);
    }
  }

  /**
   * GET /api/v1/whatsapp/contacts
   * Get contacts
   */
  async getContacts(req, res, next) {
    try {
      const { brandId, tags, groups, search, page = 1, limit = 50 } = req.query;

      // Check access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: brandId,
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      const query = { brand: brandId };

      if (tags) {
        query.tags = { $in: Array.isArray(tags) ? tags : [tags] };
      }

      if (groups) {
        query.groups = { $in: Array.isArray(groups) ? groups : [groups] };
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [contacts, total] = await Promise.all([
        WhatsAppContact.find(query)
          .sort('-createdAt')
          .skip(skip)
          .limit(parseInt(limit)),
        WhatsAppContact.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: contacts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (error) {
      logger.error('[WHATSAPP] Failed to fetch contacts', { error: error.message });
      next(error);
    }
  }

  /**
   * POST /api/v1/whatsapp/contacts
   * Create contact
   */
  async createContact(req, res, next) {
    try {
      const { brandId, name, phone, email, tags, groups, customFields, notes } = req.body;

      // Check access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: brandId,
      });

      if (!membership || !membership.permissions.includes('create_posts')) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
        });
      }

      const contact = await WhatsAppContact.create({
        brand: brandId,
        name,
        phone,
        email,
        tags: tags || [],
        groups: groups || [],
        customFields: customFields || {},
        notes,
        createdBy: req.user._id,
      });

      res.status(201).json({
        success: true,
        message: 'Contact created',
        data: contact,
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Contact with this phone number already exists',
        });
      }
      logger.error('[WHATSAPP] Contact creation failed', { error: error.message });
      next(error);
    }
  }

  /**
   * PATCH /api/v1/whatsapp/contacts/:id
   * Update contact
   */
  async updateContact(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const contact = await WhatsAppContact.findById(id);
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found',
        });
      }

      // Check access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: contact.brand,
      });

      if (!membership || !membership.permissions.includes('create_posts')) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
        });
      }

      Object.assign(contact, updates);
      await contact.save();

      res.json({
        success: true,
        message: 'Contact updated',
        data: contact,
      });
    } catch (error) {
      logger.error('[WHATSAPP] Contact update failed', { error: error.message });
      next(error);
    }
  }

  /**
   * DELETE /api/v1/whatsapp/contacts/:id
   * Delete contact
   */
  async deleteContact(req, res, next) {
    try {
      const { id } = req.params;

      const contact = await WhatsAppContact.findById(id);
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found',
        });
      }

      // Check access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: contact.brand,
      });

      if (!membership || !membership.permissions.includes('create_posts')) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
        });
      }

      await contact.deleteOne();

      res.json({
        success: true,
        message: 'Contact deleted',
      });
    } catch (error) {
      logger.error('[WHATSAPP] Contact deletion failed', { error: error.message });
      next(error);
    }
  }

  /**
   * POST /api/v1/whatsapp/send-template
   * Send template message
   */
  async sendTemplateMessage(req, res, next) {
    try {
      const { 
        channelId, 
        templateName, 
        languageCode, 
        recipientIds, 
        components 
      } = req.body;

      if (!channelId || !templateName || !recipientIds || !recipientIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
      }

      // Get channel
      const channel = await Channel.findById(channelId);
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: 'Channel not found',
        });
      }

      // Check access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: channel.brand,
      });

      if (!membership || !membership.permissions.includes('publish_posts')) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
        });
      }

      // Get recipients
      const recipients = await WhatsAppContact.find({
        _id: { $in: recipientIds },
        brand: channel.brand,
      });

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid recipients found',
        });
      }

      // Send messages
      const provider = ProviderFactory.getProvider('whatsapp', channel);
      const results = await provider.sendTemplateMessage(
        templateName,
        languageCode || 'en',
        recipients,
        components || []
      );

      // Update last message sent timestamp
      await WhatsAppContact.updateMany(
        { _id: { $in: recipientIds } },
        { lastMessageSentAt: new Date() }
      );

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      res.json({
        success: true,
        message: `Sent to ${successCount} recipients, ${failCount} failed`,
        data: {
          results,
          summary: {
            total: results.length,
            success: successCount,
            failed: failCount,
          },
        },
      });
    } catch (error) {
      logger.error('[WHATSAPP] Message send failed', { error: error.message });
      next(error);
    }
  }

  /**
   * ✅ NEW: POST /api/v1/whatsapp/send-text
   * Send text message
   */
  async sendTextMessage(req, res, next) {
    try {
      const { channelId, recipientIds, text, previewUrl = false } = req.body;

      if (!channelId || !recipientIds || !text) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
      }

      const channel = await Channel.findById(channelId);
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: 'Channel not found',
        });
      }

      // Check access
      const membership = await Membership.findOne({
        user: req.user._id,
        brand: channel.brand,
      });

      if (!membership || !membership.permissions.includes('publish_posts')) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
        });
      }

      const recipients = await WhatsAppContact.find({
        _id: { $in: recipientIds },
        brand: channel.brand,
      });

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid recipients found',
        });
      }

      const provider = ProviderFactory.getProvider('whatsapp', channel);
      const results = [];

      for (const recipient of recipients) {
        try {
          const result = await provider.sendTextMessage(recipient.phone, text, previewUrl);
          results.push({ recipient: recipient.phone, ...result });
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          results.push({
            recipient: recipient.phone,
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      res.json({
        success: true,
        message: `Sent to ${successCount}/${recipients.length} recipients`,
        data: { results },
      });
    } catch (error) {
      logger.error('[WHATSAPP] Text send failed', { error: error.message });
      next(error);
    }
  }

  /**
   * ✅ NEW: POST /api/v1/whatsapp/send-media
   * Send media message
   */
  async sendMediaMessage(req, res, next) {
    try {
      const { channelId, recipientIds, mediaType, mediaUrl, caption } = req.body;

      if (!channelId || !recipientIds || !mediaType || !mediaUrl) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
      }

      const channel = await Channel.findById(channelId);
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: 'Channel not found',
        });
      }

      const membership = await Membership.findOne({
        user: req.user._id,
        brand: channel.brand,
      });

      if (!membership || !membership.permissions.includes('publish_posts')) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
        });
      }

      const recipients = await WhatsAppContact.find({
        _id: { $in: recipientIds },
        brand: channel.brand,
      });

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid recipients found',
        });
      }

      const provider = ProviderFactory.getProvider('whatsapp', channel);
      const results = [];

      for (const recipient of recipients) {
        try {
          const result = await provider.sendMediaMessage(
            recipient.phone,
            mediaType,
            mediaUrl,
            caption
          );
          results.push({ recipient: recipient.phone, ...result });
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          results.push({
            recipient: recipient.phone,
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      res.json({
        success: true,
        message: `Sent to ${successCount}/${recipients.length} recipients`,
        data: { results },
      });
    } catch (error) {
      logger.error('[WHATSAPP] Media send failed', { error: error.message });
      next(error);
    }
  }
}

module.exports = new WhatsAppController();
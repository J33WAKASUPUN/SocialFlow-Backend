const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.templateCache = new Map();
    this.useSendGrid = false;
    this.initializeTransporter();
  }

  /**
   * Initialize Email Transporter
   * Supports both SendGrid API and SMTP
   */
  initializeTransporter() {
    const mailHost = process.env.MAIL_HOST || '';
    
    // Check if using SendGrid
    if (mailHost.includes('sendgrid') || process.env.SENDGRID_API_KEY) {
      this.initializeSendGrid();
    } else {
      this.initializeSMTP();
    }
  }

  /**
   * Initialize SendGrid (Recommended for production)
   */
  initializeSendGrid() {
    const apiKey = process.env.SENDGRID_API_KEY || process.env.MAIL_PASSWORD;
    
    if (!apiKey || !apiKey.startsWith('SG.')) {
      logger.error('❌ Invalid SendGrid API key. Must start with "SG."');
      logger.warn('⚠️ Falling back to SMTP configuration');
      this.initializeSMTP();
      return;
    }

    sgMail.setApiKey(apiKey);
    this.useSendGrid = true;
    
    logger.info('✅ SendGrid email service initialized', {
      from: process.env.MAIL_FROM_ADDRESS,
      fromName: process.env.MAIL_FROM_NAME || 'SocialFlow',
    });
  }

  /**
   * Initialize SMTP (Fallback)
   */
  initializeSMTP() {
    const transportConfig = {
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT, 10) || 587,
      secure: process.env.MAIL_PORT == 465,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    };

    logger.info('📧 SMTP configuration:', {
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      user: process.env.MAIL_USER?.substring(0, 5) + '***',
      from: process.env.MAIL_FROM_ADDRESS,
    });

    this.transporter = nodemailer.createTransport(transportConfig);
    this.useSendGrid = false;
    
    // Verify connection
    this.verifyConnection();
  }

  /**
   * Verify SMTP Connection
   */
  async verifyConnection() {
    if (this.useSendGrid) {
      logger.info('✅ Using SendGrid API - no SMTP verification needed');
      return true;
    }

    try {
      await this.transporter.verify();
      logger.info('✅ SMTP email service connected successfully');
      return true;
    } catch (error) {
      logger.error('❌ SMTP connection failed:', error.message);
      
      if (error.message.includes('Invalid login')) {
        logger.warn('⚠️ Check MAIL_USER and MAIL_PASSWORD credentials');
      }
      if (error.message.includes('ECONNREFUSED')) {
        logger.warn('⚠️ Cannot connect to mail server. Check MAIL_HOST and MAIL_PORT');
      }
      
      return false;
    }
  }

  /**
   * Load and Compile Email Template
   */
  async loadTemplate(templateName) {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName);
    }

    try {
      const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiledTemplate = handlebars.compile(templateContent);
      
      this.templateCache.set(templateName, compiledTemplate);
      return compiledTemplate;
    } catch (error) {
      logger.error(`Error loading email template ${templateName}:`, error.message);
      return handlebars.compile('<div>{{message}}</div>');
    }
  }

  /**
   * Send Email - Unified method for SendGrid and SMTP
   */
  async sendEmail({ to, subject, template, data, attachments = [] }) {
    try {
      const compiledTemplate = await this.loadTemplate(template);
      const html = compiledTemplate(data);

      const fromAddress = process.env.MAIL_FROM_ADDRESS || 'noreply@socialflow.com';
      const fromName = process.env.MAIL_FROM_NAME || 'SocialFlow';

      if (this.useSendGrid) {
        return await this.sendWithSendGrid({ to, subject, html, fromAddress, fromName, attachments });
      } else {
        return await this.sendWithSMTP({ to, subject, html, fromAddress, fromName, attachments });
      }
    } catch (error) {
      logger.error(`❌ Failed to send email to ${to}:`, {
        error: error.message,
        template,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send with SendGrid API
   */
  async sendWithSendGrid({ to, subject, html, fromAddress, fromName, attachments }) {
    const msg = {
      to,
      from: {
        email: fromAddress,
        name: fromName,
      },
      subject,
      html,
    };

    // Add attachments if any
    if (attachments && attachments.length > 0) {
      msg.attachments = attachments.map(att => ({
        content: att.content.toString('base64'),
        filename: att.filename,
        type: att.contentType,
        disposition: 'attachment',
      }));
    }

    try {
      const response = await sgMail.send(msg);
      
      logger.info(`✅ Email sent via SendGrid to ${to}: ${subject}`, {
        statusCode: response[0]?.statusCode,
      });
      
      return {
        success: true,
        messageId: response[0]?.headers?.['x-message-id'] || 'sendgrid-' + Date.now(),
        provider: 'sendgrid',
      };
    } catch (error) {
      const errorMessage = error.response?.body?.errors?.[0]?.message || error.message;
      logger.error(`❌ SendGrid error:`, {
        statusCode: error.code,
        message: errorMessage,
        to,
        subject,
      });
      
      // Provide helpful error messages
      if (error.code === 403) {
        logger.warn('⚠️ SendGrid: Sender email not verified. Verify at: Settings > Sender Authentication');
      }
      if (error.code === 401) {
        logger.warn('⚠️ SendGrid: Invalid API key. Check SENDGRID_API_KEY or MAIL_PASSWORD');
      }
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send with SMTP (Nodemailer)
   */
  async sendWithSMTP({ to, subject, html, fromAddress, fromName, attachments }) {
    const mailOptions = {
      from: {
        name: fromName,
        address: fromAddress,
      },
      to,
      subject,
      html,
      attachments,
    };

    const info = await this.transporter.sendMail(mailOptions);
    
    logger.info(`✅ Email sent via SMTP to ${to}: ${subject}`, {
      messageId: info.messageId,
    });
    
    return {
      success: true,
      messageId: info.messageId,
      provider: 'smtp',
    };
  }

  // ============================================
  // EMAIL METHODS
  // ============================================

  /**
   * Send Verification Email
   */
  async sendVerificationEmail(email, token, userName) {
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
    
    return await this.sendEmail({
      to: email,
      subject: 'Verify Your Email Address - SocialFlow',
      template: 'email-verification',
      data: {
        userName,
        verificationUrl,
        appName: process.env.APP_NAME || 'SocialFlow',
        supportEmail: process.env.MAIL_FROM_ADDRESS,
      },
    });
  }

  /**
   * Send Password Reset Email
   */
  async sendPasswordResetEmail(email, token, userName) {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    
    return await this.sendEmail({
      to: email,
      subject: 'Reset Your Password - SocialFlow',
      template: 'password-reset',
      data: {
        userName,
        resetUrl,
        expiryTime: '1 hour',
        appName: process.env.APP_NAME || 'SocialFlow',
        supportEmail: process.env.MAIL_FROM_ADDRESS,
      },
    });
  }

  /**
   * Send Welcome Email
   */
  async sendWelcomeEmail(email, userName) {
    return await this.sendEmail({
      to: email,
      subject: 'Welcome to SocialFlow! 🎉',
      template: 'welcome',
      data: {
        userName,
        dashboardUrl: `${process.env.CLIENT_URL}/dashboard`,
        appName: process.env.APP_NAME || 'SocialFlow',
      },
    });
  }

  /**
   * Send Post Published Notification
   */
  async sendPostPublishedEmail(email, userName, postData) {
    return await this.sendEmail({
      to: email,
      subject: '✅ Your Post Has Been Published - SocialFlow',
      template: 'post-published',
      data: {
        userName,
        postContent: postData.content?.substring(0, 200) + '...',
        platforms: Array.isArray(postData.platforms) ? postData.platforms.join(', ') : postData.platforms,
        publishedAt: new Date(postData.publishedAt).toLocaleString(),
        viewUrl: `${process.env.CLIENT_URL}/posts/${postData.id}`,
        appName: process.env.APP_NAME || 'SocialFlow',
      },
    });
  }

  /**
   * Send Post Failed Notification
   */
  async sendPostFailedEmail(email, userName, postData, error) {
    return await this.sendEmail({
      to: email,
      subject: '❌ Post Publishing Failed - SocialFlow',
      template: 'post-failed',
      data: {
        userName,
        postContent: postData.content?.substring(0, 200) + '...',
        platforms: Array.isArray(postData.platforms) ? postData.platforms.join(', ') : postData.platforms,
        errorMessage: error,
        retryUrl: `${process.env.CLIENT_URL}/posts/${postData.id}`,
        supportEmail: process.env.MAIL_FROM_ADDRESS,
        appName: process.env.APP_NAME || 'SocialFlow',
      },
    });
  }

  /**
   * Send Team Invitation Email
   */
  async sendTeamInvitationEmail(email, inviterName, brandName, inviteToken) {
    const acceptUrl = `${process.env.CLIENT_URL}/invitations/accept?token=${inviteToken}`;
    
    return await this.sendEmail({
      to: email,
      subject: `You've been invited to join ${brandName} - SocialFlow`,
      template: 'team-invitation',
      data: {
        inviterName,
        brandName,
        acceptUrl,
        appName: process.env.APP_NAME || 'SocialFlow',
      },
    });
  }

  /**
   * Send Channel Disconnected Alert
   */
  async sendChannelDisconnectedEmail(email, userName, platformName, brandName) {
    return await this.sendEmail({
      to: email,
      subject: `⚠️ ${platformName} Account Disconnected - SocialFlow`,
      template: 'channel-disconnected',
      data: {
        userName,
        platformName,
        brandName,
        reconnectUrl: `${process.env.CLIENT_URL}/channels`,
        appName: process.env.APP_NAME || 'SocialFlow',
      },
    });
  }

  /**
   * Send Daily Summary Email
   */
  async sendDailySummaryEmail(email, userName, summaryData) {
    return await this.sendEmail({
      to: email,
      subject: '📊 Your Daily Social Media Summary - SocialFlow',
      template: 'daily-summary',
      data: {
        userName,
        date: new Date().toLocaleDateString(),
        totalPosts: summaryData.totalPosts || 0,
        totalEngagement: summaryData.totalEngagement || 0,
        topPost: summaryData.topPost,
        scheduledPosts: summaryData.scheduledPosts || 0,
        dashboardUrl: `${process.env.CLIENT_URL}/dashboard`,
        appName: process.env.APP_NAME || 'SocialFlow',
      },
    });
  }

  /**
   * Send Test Email
   */
  async sendTestEmail(email) {
    return await this.sendEmail({
      to: email,
      subject: '✅ Test Email from SocialFlow',
      template: 'test-email',
      data: {
        appName: process.env.APP_NAME || 'SocialFlow',
        testTime: new Date().toLocaleString(),
        mailHost: this.useSendGrid ? 'SendGrid API' : process.env.MAIL_HOST,
        mailUser: this.useSendGrid ? 'SendGrid' : process.env.MAIL_USER,
        provider: this.useSendGrid ? 'SendGrid' : 'SMTP',
      },
    });
  }

  /**
   * Send 2FA Verification Code Email
   */
  async send2FACodeEmail(email, userName, code, ipAddress = 'Unknown', requestTime = new Date().toLocaleString()) {
    return await this.sendEmail({
      to: email,
      subject: `${code} is your verification code - SocialFlow`,
      template: '2fa-code',
      data: {
        userName,
        code,
        ipAddress,
        requestTime,
        appName: process.env.APP_NAME || 'SocialFlow',
        supportEmail: process.env.MAIL_FROM_ADDRESS,
      },
    });
  }
}

module.exports = new EmailService();
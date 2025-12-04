const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.templateCache = new Map();
    this.initializeTransporter();
  }

  /**
   * Initialize Email Transporter
   */
  initializeTransporter() {
    const transportConfig = {
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT, 10),
      secure: process.env.MAIL_PORT == 465, // true for 465, false for other ports
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
      tls: {
        // Do not fail on invalid certs (for development)
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    };

    this.transporter = nodemailer.createTransport(transportConfig);

    // Verify connection configuration
    this.verifyConnection();
  }

  /**
   * Verify SMTP Connection
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.info('✅ Email service connected successfully');
    } catch (error) {
      logger.error('❌ Email service connection failed:', error.message);
      logger.warn('⚠️  Emails will not be sent. Check your MAIL_* environment variables.');
    }
  }

  /**
   * Load and Compile Email Template
   */
  async loadTemplate(templateName) {
    // Check cache first
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName);
    }

    try {
      const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiledTemplate = handlebars.compile(templateContent);
      
      // Cache the compiled template
      this.templateCache.set(templateName, compiledTemplate);
      
      return compiledTemplate;
    } catch (error) {
      logger.error(`Error loading email template ${templateName}:`, error.message);
      // Return a fallback template
      return handlebars.compile('<div>{{message}}</div>');
    }
  }

  /**
   * Send Email with Template
   */
  async sendEmail({ to, subject, template, data, attachments = [] }) {
    try {
      // Load and compile template
      const compiledTemplate = await this.loadTemplate(template);
      const html = compiledTemplate(data);

      const mailOptions = {
        from: {
          name: process.env.MAIL_FROM_NAME || 'Social Media Platform',
          address: process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USER,
        },
        to,
        subject,
        html,
        attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`✅ Email sent to ${to}: ${subject}`);
      logger.debug(`Message ID: ${info.messageId}`);
      
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      logger.error(`❌ Failed to send email to ${to}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send Verification Email
   */
  async sendVerificationEmail(email, token, userName) {
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
    
    return await this.sendEmail({
      to: email,
      subject: 'Verify Your Email Address',
      template: 'email-verification',
      data: {
        userName,
        verificationUrl,
        appName: process.env.APP_NAME || 'Social Media Platform',
        supportEmail: process.env.MAIL_FROM_ADDRESS,
      },
    });
  }

  /**
   * Send Password Reset Email
   */
  async sendPasswordResetEmail(email, token, userName) {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    const expiryTime = '1 hour';
    
    return await this.sendEmail({
      to: email,
      subject: 'Reset Your Password',
      template: 'password-reset',
      data: {
        userName,
        resetUrl,
        expiryTime,
        appName: process.env.APP_NAME || 'Social Media Platform',
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
      subject: 'Welcome to Social Media Marketing Platform!',
      template: 'welcome',
      data: {
        userName,
        dashboardUrl: `${process.env.CLIENT_URL}/dashboard`,
        appName: process.env.APP_NAME || 'Social Media Platform',
      },
    });
  }

  /**
   * Send Post Published Notification
   */
  async sendPostPublishedEmail(email, userName, postData) {
    return await this.sendEmail({
      to: email,
      subject: '✅ Your Post Has Been Published',
      template: 'post-published',
      data: {
        userName,
        postContent: postData.content,
        platforms: postData.platforms.join(', '),
        publishedAt: new Date(postData.publishedAt).toLocaleString(),
        viewUrl: `${process.env.CLIENT_URL}/posts/${postData.id}`,
        appName: process.env.APP_NAME || 'Social Media Platform',
      },
    });
  }

  /**
   * Send Post Failed Notification
   */
  async sendPostFailedEmail(email, userName, postData, error) {
    return await this.sendEmail({
      to: email,
      subject: '❌ Post Publishing Failed',
      template: 'post-failed',
      data: {
        userName,
        postContent: postData.content,
        platforms: postData.platforms.join(', '),
        errorMessage: error,
        retryUrl: `${process.env.CLIENT_URL}/posts/${postData.id}`,
        supportEmail: process.env.MAIL_FROM_ADDRESS,
        appName: process.env.APP_NAME || 'Social Media Platform',
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
      subject: `You've been invited to join ${brandName}`,
      template: 'team-invitation',
      data: {
        inviterName,
        brandName,
        acceptUrl,
        appName: process.env.APP_NAME || 'Social Media Platform',
      },
    });
  }

  /**
   * Send Channel Disconnected Alert
   */
  async sendChannelDisconnectedEmail(email, userName, platformName, brandName) {
    return await this.sendEmail({
      to: email,
      subject: `${platformName} Account Disconnected`,
      template: 'channel-disconnected',
      data: {
        userName,
        platformName,
        brandName,
        reconnectUrl: `${process.env.CLIENT_URL}/channels`,
        appName: process.env.APP_NAME || 'Social Media Platform',
      },
    });
  }

  /**
   * Send Daily Summary Email
   */
  async sendDailySummaryEmail(email, userName, summaryData) {
    return await this.sendEmail({
      to: email,
      subject: '📊 Your Daily Social Media Summary',
      template: 'daily-summary',
      data: {
        userName,
        date: new Date().toLocaleDateString(),
        totalPosts: summaryData.totalPosts,
        totalEngagement: summaryData.totalEngagement,
        topPost: summaryData.topPost,
        scheduledPosts: summaryData.scheduledPosts,
        dashboardUrl: `${process.env.CLIENT_URL}/dashboard`,
        appName: process.env.APP_NAME || 'Social Media Platform',
      },
    });
  }

  /**
   * Send Test Email (for configuration testing)
   */
  async sendTestEmail(email) {
    return await this.sendEmail({
      to: email,
      subject: 'Test Email from Social Media Platform',
      template: 'test-email',
      data: {
        appName: process.env.APP_NAME || 'Social Media Platform',
        testTime: new Date().toLocaleString(),
        mailHost: process.env.MAIL_HOST,
        mailUser: process.env.MAIL_USER,
      },
    });
  }

   /**
   * Send 2FA Verification Code Email
   */
  async send2FACodeEmail(email, userName, code, ipAddress = 'Unknown', requestTime = new Date().toLocaleString()) {
    return await this.sendEmail({
      to: email,
      subject: `${code} is your verification code`,
      template: '2fa-code',
      data: {
        userName,
        code,
        ipAddress,
        requestTime,
        appName: process.env.APP_NAME || 'Social Media Platform',
        supportEmail: process.env.MAIL_FROM_ADDRESS,
      },
    });
  }
}

module.exports = new EmailService();
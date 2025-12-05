const Channel = require("../models/Channel");
const Brand = require("../models/Brand");
const Membership = require("../models/Membership");
const encryptionService = require("./encryptionService");
const oauthService = require("./oAuthService");
const ProviderFactory = require("../providers/ProviderFactory");
const logger = require("../utils/logger");

class ChannelService {
  /**
   * Helper: Check if user has access to brand (direct or org-level)
   */
  async checkBrandAccess(userId, brandId, requiredPermission = null) {
    // 1. Check direct brand membership
    let membership = await Membership.findOne({
      user: userId,
      brand: brandId,
    });

    // 2. If no direct membership, check organization-level
    if (!membership) {
      const brand = await Brand.findById(brandId);
      if (!brand) {
        throw new Error("Brand not found");
      }

      membership = await Membership.findOne({
        user: userId,
        organization: brand.organization,
      });
    }

    if (!membership) {
      throw new Error("Access denied");
    }

    // 3. If permission required, check it
    if (requiredPermission && !membership.hasPermission(requiredPermission)) {
      throw new Error("Permission denied");
    }

    return membership;
  }

  /**
   * Get authorization URL for connecting a channel
   */
  async getAuthorizationUrl(provider, brandId, userId, returnUrl = null) {
    // Check if brand exists and user has connect_channels permission
    const brand = await Brand.findById(brandId);
    if (!brand) {
      throw new Error("Brand not found");
    }

    // Use helper with permission check
    await this.checkBrandAccess(userId, brandId, "connect_channels");

    // Generate OAuth URL
    const { authUrl, state } = await oauthService.getAuthorizationUrl(
      provider,
      brandId,
      userId,
      returnUrl
    );

    return { authUrl, state };
  }

  /**
   * Handle OAuth callback and create channel
   */
  async handleCallback(provider, code, state) {
    // Validate state and get metadata
    const stateData = await oauthService.validateState(state);

    if (!stateData) {
      throw new Error("Invalid or expired state");
    }

    const { brandId, userId, returnUrl } = stateData;

    // Verify user still has permission
    await this.checkBrandAccess(userId, brandId, "connect_channels");

    // Get provider instance
    const providerInstance = ProviderFactory.getProvider(provider);

    // Exchange code for tokens
    const tokenData = await providerInstance.handleCallback(code, state);

    // Check if channel already exists
    let channel = await Channel.findOne({
      brand: brandId,
      provider: provider,
      platformUserId: tokenData.platformUserId,
    });

    if (channel) {
      // Update existing channel
      channel.accessToken = encryptionService.encrypt(tokenData.accessToken);
      channel.refreshToken = tokenData.refreshToken
        ? encryptionService.encrypt(tokenData.refreshToken)
        : channel.refreshToken;
      channel.tokenExpiresAt = tokenData.expiresAt;
      channel.connectionStatus = "active";
      channel.displayName = tokenData.displayName || channel.displayName;
      channel.avatar = tokenData.avatar || channel.avatar;
      channel.platformUsername =
        tokenData.platformUsername || channel.platformUsername;
      channel.profileUrl = tokenData.profileUrl || channel.profileUrl;
      channel.providerData = tokenData.providerData || channel.providerData;
      channel.lastHealthCheck = new Date();
      channel.healthCheckError = null;

      await channel.save();
    } else {
      // Create new channel
      channel = await Channel.create({
        brand: brandId,
        provider: provider,
        platformUserId: tokenData.platformUserId,
        platformUsername: tokenData.platformUsername,
        displayName: tokenData.displayName,
        avatar: tokenData.avatar,
        profileUrl: tokenData.profileUrl,
        accessToken: encryptionService.encrypt(tokenData.accessToken),
        refreshToken: tokenData.refreshToken
          ? encryptionService.encrypt(tokenData.refreshToken)
          : null,
        tokenExpiresAt: tokenData.expiresAt,
        scopes: tokenData.scopes || [],
        connectionStatus: "active",
        providerData: tokenData.providerData || {},
        connectedBy: userId,
        lastHealthCheck: new Date(),
      });
    }

    return { channel, returnUrl };
  }

  /**
   * Get all channels for a brand
   */
  async getBrandChannels(brandId, userId) {
    // Check user access (any membership is enough to view channels)
    await this.checkBrandAccess(userId, brandId);

    // Get all channels (including disconnected)
    const channels = await Channel.find({
      brand: brandId,
    }).sort({ createdAt: -1 });

    // Remove encrypted tokens from response
    return channels.map((channel) => ({
      _id: channel._id,
      id: channel._id,
      provider: channel.provider,
      platformUserId: channel.platformUserId,
      platformUsername: channel.platformUsername,
      displayName: channel.displayName,
      avatar: channel.avatar,
      profileUrl: channel.profileUrl,
      connectionStatus: channel.connectionStatus,
      lastHealthCheck: channel.lastHealthCheck,
      healthCheckError: channel.healthCheckError,
      providerData: channel.providerData,
      connectedAt: channel.connectedAt,
      connectedBy: channel.connectedBy,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    }));
  }

  /**
   * Get disconnected channels for a brand
   */
  async getDisconnectedChannels(brandId, userId) {
    // Check user access
    await this.checkBrandAccess(userId, brandId);

    const channels = await Channel.find({
      brand: brandId,
      connectionStatus: "disconnected",
    }).sort({ updatedAt: -1 });

    return channels.map((channel) => ({
      id: channel._id,
      provider: channel.provider,
      platformUserId: channel.platformUserId,
      platformUsername: channel.platformUsername,
      displayName: channel.displayName,
      avatar: channel.avatar,
      connectionStatus: channel.connectionStatus,
      disconnectedAt: channel.updatedAt,
      canReconnect: true,
    }));
  }

  /**
   * Test channel connection
   */
  async testConnection(channelId, userId) {
    const channel = await Channel.findById(channelId).populate("brand");

    if (!channel) {
      throw new Error("Channel not found");
    }

    // Check user access
    await this.checkBrandAccess(userId, channel.brand._id);

    try {
      const ProviderFactory = require("../providers/ProviderFactory");
      const provider = ProviderFactory.getProvider(channel.provider, channel);
      
      const isValid = await provider.testConnection();
      
      // Only update status, don't disconnect on failure
      channel.lastHealthCheck = new Date();
      
      if (isValid) {
        channel.connectionStatus = 'active';
        channel.healthCheckError = null;
      } else {
        // DON'T change to disconnected immediately - just log the error
        channel.healthCheckError = 'Connection test returned false';
        logger.warn(`Channel ${channelId} test returned false but keeping active`);
      }
      
      await channel.save();

      return { 
        isValid, 
        lastHealthCheck: channel.lastHealthCheck,
        connectionStatus: channel.connectionStatus 
      };
    } catch (error) {
      // Log error but DON'T disconnect the channel
      channel.lastHealthCheck = new Date();
      channel.healthCheckError = error.message;
      // Keep status as 'active' - don't auto-disconnect
      await channel.save();
      
      logger.error(`Channel test failed but keeping active: ${error.message}`);
      
      throw error;
    }
  }

  /**
   * Disconnect channel
   */
  async disconnectChannel(channelId, userId) {
    const channel = await Channel.findById(channelId).populate("brand");

    if (!channel) {
      throw new Error("Channel not found");
    }

    // Check user access - need connect_channels permission
    await this.checkBrandAccess(userId, channel.brand._id, "connect_channels");

    channel.connectionStatus = "disconnected";
    await channel.save();

    logger.info(`Channel disconnected: ${channel.provider} (ID: ${channelId})`);

    return { success: true };
  }

  /**
   * Permanently delete channel (GDPR compliance)
   */
  async permanentlyDeleteChannel(channelId, userId) {
    const channel = await Channel.findById(channelId).populate("brand");

    if (!channel) {
      throw new Error("Channel not found");
    }

    // Check user access - need connect_channels permission
    await this.checkBrandAccess(userId, channel.brand._id, "connect_channels");

    // Delete all published posts from this channel
    const PublishedPost = require("../models/PublishedPost");
    await PublishedPost.deleteMany({ channel: channelId });

    logger.info(`Deleted published posts for channel: ${channelId}`);

    // Delete the channel document
    await channel.deleteOne();

    logger.info(
      `Permanently deleted channel: ${channel.provider} (ID: ${channelId})`
    );

    return { success: true };
  }

  /**
   * Refresh channel access token
   */
  async refreshToken(channelId, userId) {
    const channel = await Channel.findById(channelId).populate("brand");

    if (!channel) {
      throw new Error("Channel not found");
    }

    // Check user access - need connect_channels permission
    await this.checkBrandAccess(userId, channel.brand._id, "connect_channels");

    // Get provider instance
    const provider = ProviderFactory.getProvider(channel.provider, channel);

    // Refresh token
    const result = await provider.refreshAccessToken();

    if (result.accessToken) {
      channel.accessToken = encryptionService.encrypt(result.accessToken);
      if (result.refreshToken) {
        channel.refreshToken = encryptionService.encrypt(result.refreshToken);
      }
      if (result.expiresAt) {
        channel.tokenExpiresAt = result.expiresAt;
      }
      channel.connectionStatus = "active";
      await channel.save();
    }

    return { success: true };
  }
}

module.exports = new ChannelService();
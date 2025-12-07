const crypto = require("crypto");
const redisClient = require("../config/redis");
const logger = require("../utils/logger");

class OAuthService {
  /**
   * Generate OAuth state parameter
   * Store in Redis with metadata
   */
  async generateState(brandId, userId, provider, returnUrl = null) {
    const state = crypto.randomBytes(32).toString("hex");
    const cacheClient = redisClient.getCache();

    // Verify Redis is connected
    if (!cacheClient) {
      logger.error("Redis cache client not available");
      throw new Error("OAuth service temporarily unavailable");
    }

    // ✅ ADD TRY-CATCH AROUND REDIS OPERATIONS
    if (!cacheClient.isOpen) {
      logger.error("Redis client is not connected");
      throw new Error(
        "OAuth service temporarily unavailable - Redis disconnected"
      );
    }

    const stateData = {
      brandId,
      userId,
      provider,
      returnUrl: returnUrl || process.env.CLIENT_URL,
      createdAt: Date.now(),
    };

    try {
      await cacheClient.setEx(
        `oauth:state:${state}`,
        1800, // 30 minutes
        JSON.stringify(stateData)
      );

      // Verify state was stored
      const verification = await cacheClient.get(`oauth:state:${state}`);
      if (!verification) {
        throw new Error("Failed to store OAuth state in Redis");
      }

      logger.info(`OAuth state generated and verified for ${provider}`, {
        brandId,
        userId,
        state: state.substring(0, 16) + "...",
      });

      return state;
    } catch (error) {
      logger.error("Failed to generate OAuth state:", {
        message: error.message,
        stack: error.stack,
        redisConnected: cacheClient?.isOpen,
      });
      throw new Error("OAuth service temporarily unavailable");
    }
  }

  /**
   * Validate OAuth state parameter
   * Retrieve and delete from Redis
   */
  async validateState(state) {
    const cacheClient = redisClient.getCache();

    try {
      // Log state validation attempt
      logger.info("Validating OAuth state", {
        state: state.substring(0, 16) + "...",
      });

      const stateDataJson = await cacheClient.get(`oauth:state:${state}`);

      if (!stateDataJson) {
        // etter error logging
        logger.error("OAuth state not found in Redis", {
          state: state.substring(0, 16) + "...",
          hint: "State expired (>30min) or never created",
        });
        throw new Error("Invalid or expired OAuth state");
      }

      // Delete state to prevent replay attacks
      await cacheClient.del(`oauth:state:${state}`);

      const stateData = JSON.parse(stateDataJson);

      // Check if state is expired (30 minutes)
      const age = Date.now() - stateData.createdAt;
      const maxAge = 1800000; // 30 minutes in ms

      if (age > maxAge) {
        logger.error("OAuth state expired", {
          age: Math.round(age / 1000) + "s",
          maxAge: Math.round(maxAge / 1000) + "s",
        });
        throw new Error("OAuth state expired");
      }

      logger.info(`OAuth state validated for ${stateData.provider}`, {
        provider: stateData.provider,
        age: Math.round(age / 1000) + "s",
      });

      return stateData;
    } catch (error) {
      logger.error("OAuth state validation failed:", error);
      throw error;
    }
  }

  /**
   * Generate authorization URL for provider
   */
  async getAuthorizationUrl(provider, brandId, userId, returnUrl = null) {
    const ProviderFactory = require("../providers/ProviderFactory");

    if (!ProviderFactory.isProviderSupported(provider)) {
      throw new Error(`Provider '${provider}' is not supported`);
    }

    const providerInstance = ProviderFactory.getProvider(provider);
    const state = await this.generateState(
      brandId,
      userId,
      provider,
      returnUrl
    );
    const authUrl = providerInstance.getAuthorizationUrl(state);

    return { authUrl, state };
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(provider, code, state) {
    // Validate state
    const stateData = await this.validateState(state);

    if (stateData.provider !== provider) {
      throw new Error("Provider mismatch in OAuth state");
    }

    // Get provider instance
    const ProviderFactory = require("../providers/ProviderFactory");
    const providerInstance = ProviderFactory.getProvider(provider);

    // Exchange code for tokens and get user info
    const accountData = await providerInstance.handleCallback(code, state);

    return {
      accountData,
      stateData,
    };
  }
}

module.exports = new OAuthService();

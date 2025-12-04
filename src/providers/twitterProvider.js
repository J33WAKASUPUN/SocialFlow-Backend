const axios = require("axios");
const crypto = require("crypto");
const BaseProvider = require("./baseProvider");

class TwitterProvider extends BaseProvider {
  getConfig() {
    return {
      // OAuth 2.0 (for user authentication)
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
      
      // API v1.1 (for posting)
      apiKey: process.env.TWITTER_API_KEY,
      apiSecret: process.env.TWITTER_API_SECRET,
      bearerToken: process.env.TWITTER_BEARER_TOKEN,
      
      // Endpoints
      authUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      apiUrl: "https://api.twitter.com/2",
      callbackUrl: process.env.TWITTER_CALLBACK_URL,
      
      // Scopes
      scopes: (process.env.TWITTER_SCOPES || "tweet.read,tweet.write,users.read,offline.access").split(","),
      
      // Free Tier Limits
      postLimit: parseInt(process.env.TWITTER_FREE_TIER_POST_LIMIT) || 17,
      postWindow: parseInt(process.env.TWITTER_FREE_TIER_WINDOW) || 86400000, // 24 hours
    };
  }

  /**
   * Generate PKCE code verifier and challenge
   * Required for Twitter OAuth 2.0
   */
  generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    return { codeVerifier, codeChallenge };
  }

  /**
   * Store PKCE code verifier in Redis
   */
  async storeCodeVerifier(state, codeVerifier) {
    const redisClient = require("../config/redis");
    const cacheClient = redisClient.getCache();
    await cacheClient.setEx(
      `twitter:pkce:${state}`,
      600, // 10 minutes
      codeVerifier
    );
  }

  /**
   * Retrieve PKCE code verifier from Redis
   */
  async getCodeVerifier(state) {
    const redisClient = require("../config/redis");
    const cacheClient = redisClient.getCache();
    const codeVerifier = await cacheClient.get(`twitter:pkce:${state}`);
    
    if (codeVerifier) {
      await cacheClient.del(`twitter:pkce:${state}`);
    }
    
    return codeVerifier;
  }

  /**
   * Get OAuth 2.0 Authorization URL with PKCE
   */
  getAuthorizationUrl(state) {
    const config = this.getConfig();
    const { codeVerifier, codeChallenge } = this.generatePKCE();

    // Store code verifier for later use
    this.storeCodeVerifier(state, codeVerifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      state: state,
      scope: config.scopes.join(" "),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code, state) {
    const config = this.getConfig();

    try {
      // Retrieve PKCE code verifier
      const codeVerifier = await this.getCodeVerifier(state);
      if (!codeVerifier) {
        throw new Error("PKCE code verifier not found or expired");
      }

      // Exchange authorization code for access token
      const tokenResponse = await axios.post(
        config.tokenUrl,
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: config.callbackUrl,
          code_verifier: codeVerifier,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${config.clientId}:${config.clientSecret}`
            ).toString("base64")}`,
          },
        }
      );

      const {
        access_token,
        refresh_token,
        expires_in,
        scope,
      } = tokenResponse.data;

      // Get user profile
      const userResponse = await axios.get(`${config.apiUrl}/users/me`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
        params: {
          "user.fields": "id,name,username,profile_image_url",
        },
      });

      const user = userResponse.data.data;

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        platformUserId: user.id,
        platformUsername: user.username,
        displayName: user.name,
        profileUrl: `https://twitter.com/${user.username}`,
        avatar: user.profile_image_url?.replace("_normal", ""),
        scopes: scope?.split(" ") || config.scopes,
      };
    } catch (error) {
      this.logError("OAuth callback", error);
      throw new Error(
        `Twitter OAuth failed: ${
          error.response?.data?.error_description || error.message
        }`
      );
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken() {
    const config = this.getConfig();
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    try {
      const response = await axios.post(
        config.tokenUrl,
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(
              `${config.clientId}:${config.clientSecret}`
            ).toString("base64")}`,
          },
        }
      );

      const {
        access_token,
        refresh_token,
        expires_in,
      } = response.data;

      this.log("Token refreshed", { expiresIn: expires_in });

      return {
        accessToken: access_token,
        refreshToken: refresh_token || refreshToken,
        expiresIn: expires_in,
      };
    } catch (error) {
      this.logError("Token refresh", error);
      throw new Error(
        `Twitter token refresh failed: ${
          error.response?.data?.error_description || error.message
        }`
      );
    }
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.get(`${config.apiUrl}/users/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.status === 200;
    } catch (error) {
      this.logError("Connection test", error);
      return false;
    }
  }

  /**
   * Check rate limit before posting
   */
  async checkRateLimit() {
    const redisClient = require("../config/redis");
    const cacheClient = redisClient.getCache();
    const config = this.getConfig();
    
    const key = `twitter:ratelimit:${this.channel._id}`;
    const count = await cacheClient.get(key);
    
    if (count && parseInt(count) >= config.postLimit) {
      const ttl = await cacheClient.ttl(key);
      throw new Error(
        `Twitter Free Tier limit reached (${config.postLimit} posts/24h). ` +
        `Resets in ${Math.ceil(ttl / 3600)} hours.`
      );
    }
    
    return true;
  }

  /**
   * Increment rate limit counter
   */
  async incrementRateLimit() {
    const redisClient = require("../config/redis");
    const cacheClient = redisClient.getCache();
    const config = this.getConfig();
    
    const key = `twitter:ratelimit:${this.channel._id}`;
    const count = await cacheClient.incr(key);
    
    if (count === 1) {
      await cacheClient.expire(key, Math.floor(config.postWindow / 1000));
    }
    
    this.log(`Rate limit: ${count}/${config.postLimit} posts used`);
  }

  /**
   * Publish tweet
   */
  async publish(post) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      // Check rate limit
      await this.checkRateLimit();

      // Combine content and hashtags
      let fullContent = post.content;
      if (post.hashtags && post.hashtags.length > 0) {
        fullContent += `\n\n${post.hashtags.join(' ')}`;
      }

      // Validate content length (280 characters)
      if (fullContent.length > 280) {
        throw new Error(`Tweet exceeds 280 character limit (${fullContent.length} chars)`);
      }

      const payload = {
        text: fullContent,
      };

      this.log("Publishing tweet", {
        textLength: fullContent.length,
        hasMedia: !!post.mediaUrls?.length,
      });

      const response = await axios.post(
        `${config.apiUrl}/tweets`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const tweet = response.data.data;

      // Increment rate limit counter
      await this.incrementRateLimit();

      this.log("Tweet published", { tweetId: tweet.id });

      return {
        success: true,
        platformPostId: tweet.id,
        platformUrl: `https://twitter.com/${this.channel.platformUsername}/status/${tweet.id}`,
        provider: "twitter",
        content: fullContent,
        mediaUrls: post.mediaUrls || [],
        mediaType: "none", // Free tier doesn't support media upload via API v2
      };
    } catch (error) {
      this.logError("Publish failed", error);
      throw new Error(
        `Twitter publish failed: ${
          error.response?.data?.errors?.[0]?.message || error.message
        }`
      );
    }
  }

  /**
   * Update tweet - NOT SUPPORTED by Twitter
   */
  async updatePost(platformPostId, newContent) {
    throw new Error(
      "Twitter does not support editing tweets. You must delete and repost."
    );
  }

  /**
   * Delete tweet
   */
  async deletePost(platformPostId) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      await axios.delete(`${config.apiUrl}/tweets/${platformPostId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      this.log("Tweet deleted", { tweetId: platformPostId });

      return {
        success: true,
      };
    } catch (error) {
      this.logError("Delete failed", error);
      throw new Error(
        `Twitter delete failed: ${
          error.response?.data?.errors?.[0]?.message || error.message
        }`
      );
    }
  }

  /**
   * Get user's tweets
   */
  async getPosts(options = {}) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.get(
        `${config.apiUrl}/users/${this.channel.platformUserId}/tweets`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            max_results: Math.min(options.limit || 10, 100),
            "tweet.fields": "created_at,public_metrics",
          },
        }
      );

      const tweets = response.data.data || [];

      this.log("Tweets retrieved", { count: tweets.length });

      return tweets.map((tweet) => ({
        platformPostId: tweet.id,
        content: tweet.text,
        platformUrl: `https://twitter.com/${this.channel.platformUsername}/status/${tweet.id}`,
        publishedAt: new Date(tweet.created_at),
        analytics: {
          likes: tweet.public_metrics?.like_count || 0,
          retweets: tweet.public_metrics?.retweet_count || 0,
          replies: tweet.public_metrics?.reply_count || 0,
          impressions: tweet.public_metrics?.impression_count || 0,
        },
      }));
    } catch (error) {
      this.logError("Get posts failed", error);
      throw new Error(
        `Twitter get posts failed: ${
          error.response?.data?.errors?.[0]?.message || error.message
        }`
      );
    }
  }

  /**
   * Get tweet analytics
   */
  async getPostAnalytics(platformPostId) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.get(
        `${config.apiUrl}/tweets/${platformPostId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            "tweet.fields": "public_metrics",
          },
        }
      );

      const tweet = response.data.data;

      return {
        likes: tweet.public_metrics?.like_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0,
        replies: tweet.public_metrics?.reply_count || 0,
        impressions: tweet.public_metrics?.impression_count || 0,
      };
    } catch (error) {
      this.logError("Get analytics failed", error);
      return null;
    }
  }
}

module.exports = TwitterProvider;
const axios = require("axios");
const FormData = require("form-data");
const BaseProvider = require("./baseProvider");

class InstagramProvider extends BaseProvider {
  getConfig() {
    return {
      appId: process.env.INSTAGRAM_APP_ID,
      appSecret: process.env.INSTAGRAM_APP_SECRET,
      callbackUrl: process.env.INSTAGRAM_CALLBACK_URL,
      authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
      apiUrl: "https://graph.facebook.com/v21.0",
      scopes: (
        process.env.INSTAGRAM_SCOPES ||
        "instagram_basic,instagram_content_publish,pages_read_engagement,pages_show_list"
      ).split(","),
    };
  }

  getAuthorizationUrl(state) {
    const config = this.getConfig();
    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.callbackUrl,
      state: state,
      scope: config.scopes.join(","),
      response_type: "code",
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  // Add this method to your InstagramProvider class

  async handleCallback(code) {
    const config = this.getConfig();

    try {
      // Step 1: Exchange code for short-lived user access token
      const tokenResponse = await axios.get(config.tokenUrl, {
        params: {
          client_id: config.appId,
          client_secret: config.appSecret,
          redirect_uri: config.callbackUrl,
          code: code,
        },
      });

      const { access_token } = tokenResponse.data;

      this.log("Short-lived token received", {
        tokenPreview: access_token.substring(0, 20) + "...",
      });

      // Step 2: Exchange for long-lived token (60 days)
      const longLivedTokenResponse = await axios.get(
        `${config.apiUrl}/oauth/access_token`,
        {
          params: {
            grant_type: "fb_exchange_token",
            client_id: config.appId,
            client_secret: config.appSecret,
            fb_exchange_token: access_token,
          },
        }
      );

      const longLivedToken = longLivedTokenResponse.data.access_token;

      this.log("Long-lived token received", {
        tokenPreview: longLivedToken.substring(0, 20) + "...",
      });

      // Check token permissions first
      try {
        const permissionsResponse = await axios.get(
          `${config.apiUrl}/me/permissions`,
          {
            params: { access_token: longLivedToken },
          }
        );

        this.log("Token permissions", {
          granted: permissionsResponse.data.data
            ?.filter((p) => p.status === "granted")
            .map((p) => p.permission),
        });
      } catch (permError) {
        this.logError("Failed to check permissions", permError);
      }

      // Try multiple methods to get pages
      let pages = [];

      // Method 1: Standard /me/accounts (works in Production mode)
      try {
        const pagesResponse = await axios.get(`${config.apiUrl}/me/accounts`, {
          params: {
            access_token: longLivedToken,
            fields:
              "id,name,access_token,instagram_business_account,category,tasks",
          },
        });
        pages = pagesResponse.data.data || [];

        this.log("Pages from /me/accounts", { count: pages.length });
      } catch (pagesError) {
        this.logError("/me/accounts failed", {
          status: pagesError.response?.status,
          error: pagesError.response?.data,
        });
      }

      // If no pages found, try getting user's administered pages
      if (pages.length === 0) {
        try {
          this.log("Trying alternative method: /me?fields=accounts...");

          const altResponse = await axios.get(`${config.apiUrl}/me`, {
            params: {
              access_token: longLivedToken,
              fields:
                "accounts{id,name,access_token,instagram_business_account,category,tasks}",
            },
          });

          pages = altResponse.data.accounts?.data || [];
          this.log("Pages from alternative method", { count: pages.length });
        } catch (altError) {
          this.logError("Alternative method failed", altError);
        }
      }

      // If still no pages, check if user info is accessible
      if (pages.length === 0) {
        try {
          const userResponse = await axios.get(`${config.apiUrl}/me`, {
            params: {
              access_token: longLivedToken,
              fields: "id,name,email",
            },
          });

          this.log("User info accessible", userResponse.data);
        } catch (userError) {
          this.logError("User info check failed", userError);
        }

        // Provide detailed error with troubleshooting steps
        throw new Error(
          "❌ No Facebook Pages accessible via Instagram API\n\n" +
            "🔍 TROUBLESHOOTING CHECKLIST:\n\n" +
            "1. APP SETUP (Meta App Dashboard):\n" +
            "   → App Mode: Development ✓\n" +
            "   → Your role: Administrator ✓\n" +
            "   ⚠️ ACTION NEEDED:\n" +
            "   • Go to App roles → Test users\n" +
            "   • Add yourself as a Test User\n" +
            "   • OR complete Business Verification\n\n" +
            "2. INSTAGRAM PRODUCT:\n" +
            "   → Go to Products → Instagram\n" +
            "   → Add Test Instagram Account: @jeewaksupun7893\n" +
            "   → Link it to your Facebook Page\n\n" +
            "3. FACEBOOK PAGE SETUP:\n" +
            "   → Page name: 'Instagram Test' ✓\n" +
            "   → Your role: Admin ✓\n" +
            "   → Instagram connected: Yes ✓\n" +
            "   ⚠️ CHECK:\n" +
            "   • Page Settings → Apps → Ensure your app is added\n" +
            "   • If Page is in Business Manager, grant app access there\n\n" +
            "4. PERMISSIONS DURING LOGIN:\n" +
            "   → When logging in via OAuth, did you:\n" +
            "   • Select 'Allow access to all pages'?\n" +
            "   • Grant all requested permissions?\n\n" +
            "5. TOKEN ISSUES:\n" +
            "   → Try logging out of Facebook completely\n" +
            "   → Clear browser cookies\n" +
            "   → Start OAuth flow fresh\n\n" +
            "📚 Meta's official guide:\n" +
            "https://developers.facebook.com/docs/instagram-basic-display-api/getting-started\n\n" +
            "💡 Quick test: Try generating a token from Graph API Explorer\n" +
            "and test the query: /me/accounts?fields=id,name,instagram_business_account"
        );
      }

      // Validate we have pages with Instagram
      this.log("Facebook Pages found", {
        count: pages.length,
        pages: pages.map((p) => ({
          id: p.id,
          name: p.name,
          hasInstagram: !!p.instagram_business_account,
          category: p.category,
        })),
      });

      // Find page with Instagram Business Account
      const pageWithInstagram = pages.find(
        (page) => page.instagram_business_account
      );

      if (!pageWithInstagram) {
        throw new Error(
          `❌ Found ${pages.length} Facebook Page(s), but none have Instagram Business Account linked.\n\n` +
            `Your Pages:\n` +
            pages.map((p) => `• ${p.name} (ID: ${p.id})`).join("\n") +
            `\n\n📱 TO FIX:\n` +
            `1. Open Facebook Page "Instagram Test"\n` +
            `2. Go to Settings → Instagram\n` +
            `3. Click "Connect Account"\n` +
            `4. Login to Instagram @jeewaksupun7893\n` +
            `5. Retry the OAuth flow\n\n` +
            `OR\n\n` +
            `1. Open Instagram app\n` +
            `2. Settings → Account → Switch to Professional Account\n` +
            `3. Link to Facebook Page: "Instagram Test"`
        );
      }

      const pageAccessToken = pageWithInstagram.access_token;
      const instagramAccountId =
        pageWithInstagram.instagram_business_account.id;

      // Step 5: Get Instagram account details
      const instagramResponse = await axios.get(
        `${config.apiUrl}/${instagramAccountId}`,
        {
          params: {
            fields:
              "id,username,name,profile_picture_url,followers_count,media_count",
            access_token: pageAccessToken,
          },
        }
      );

      const instagram = instagramResponse.data;

      this.log("✅ Instagram account connected successfully", {
        username: instagram.username,
        followers: instagram.followers_count,
        linkedPage: pageWithInstagram.name,
      });

      return {
        accessToken: pageAccessToken,
        refreshToken: null,
        expiresIn: 5184000, // 60 days
        platformUserId: instagram.id,
        platformUsername: instagram.username,
        displayName: instagram.name || instagram.username,
        profileUrl: `https://www.instagram.com/${instagram.username}/`,
        avatar: instagram.profile_picture_url,
        providerData: {
          followers: instagram.followers_count,
          mediaCount: instagram.media_count,
          facebookPageId: pageWithInstagram.id,
          facebookPageName: pageWithInstagram.name,
        },
      };
    } catch (error) {
      this.logError("OAuth callback failed", error);

      // Enhanced error logging
      if (error.response) {
        this.logError("Facebook API Error Details", {
          status: error.response.status,
          statusText: error.response.statusText,
          error: error.response.data?.error,
          url: error.config?.url,
        });
      }

      // If it's our custom error message, throw it as-is
      if (
        error.message.includes("TROUBLESHOOTING") ||
        error.message.includes("TO FIX")
      ) {
        throw error;
      }

      throw new Error(
        `Instagram OAuth failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  async refreshAccessToken() {
    // Instagram uses long-lived Page access tokens (60 days)
    // When they expire, user must reconnect
    throw new Error(
      "Instagram tokens expire after 60 days. Please reconnect your account."
    );
  }

  async testConnection() {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.get(
        `${config.apiUrl}/${this.channel.platformUserId}`,
        {
          params: {
            fields: "id,username",
            access_token: accessToken,
          },
        }
      );

      return response.status === 200;
    } catch (error) {
      this.logError("Connection test", error);
      return false;
    }
  }

  /**
   * Publish to Instagram
   *
   * Instagram API Requirements:
   * - Photos: JPEG, max 8MB, aspect ratio 0.8:1 to 1.91:1
   * - Videos: MP4, max 100MB, 3-60 seconds, aspect ratio 0.8:1 to 1.91:1
   * - Carousels: 2-10 items (photos or videos)
   * - Caption: Max 2,200 characters
   */
  async publish(post) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      // Combine content and hashtags
      let fullContent = post.content;
      if (post.hashtags && post.hashtags.length > 0) {
        fullContent += `\n\n${post.hashtags.join(' ')}`;
      }

      // Validate caption
      if (!fullContent || fullContent.length > 2200) {
        throw new Error("Instagram caption must be 1-2200 characters");
      }

      // Instagram REQUIRES media (no text-only posts)
      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        throw new Error("Instagram posts require at least one image or video");
      }

      // Determine media type
      const hasVideo = post.mediaUrls.some((url) => /\.(mp4|mov)$/i.test(url));

      if (post.mediaUrls.length === 1) {
        // Single image or video
        if (hasVideo) {
          return await this.publishVideo(
            fullContent,
            post.mediaUrls[0],
            accessToken,
            config
          );
        } else {
          return await this.publishPhoto(
            fullContent,
            post.mediaUrls[0],
            accessToken,
            config
          );
        }
      } else {
        // Carousel (2-10 items)
        if (post.mediaUrls.length > 10) {
          throw new Error("Instagram carousels support max 10 items");
        }
        return await this.publishCarousel(
          fullContent,
          post.mediaUrls,
          accessToken,
          config
        );
      }
    } catch (error) {
      this.logError("Publish failed", error);
      throw new Error(
        `Instagram publish failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Publish single photo
   */
  async publishPhoto(caption, imageUrl, accessToken, config) {
    try {
      this.log("Publishing single photo", { imageUrl });

      // Step 1: Create media container
      const containerResponse = await axios.post(
        `${config.apiUrl}/${this.channel.platformUserId}/media`,
        null,
        {
          params: {
            image_url: imageUrl,
            caption: caption,
            access_token: accessToken,
          },
        }
      );

      const containerId = containerResponse.data.id;
      this.log("Photo container created", { containerId });

      // Step 2: Wait for Instagram to process media
      await this.waitForMediaProcessing(containerId, accessToken, config);

      // Step 3: Publish container
      const publishResponse = await axios.post(
        `${config.apiUrl}/${this.channel.platformUserId}/media_publish`,
        null,
        {
          params: {
            creation_id: containerId,
            access_token: accessToken,
          },
        }
      );

      const mediaId = publishResponse.data.id;
      this.log("Photo published", { mediaId });

      return {
        success: true,
        platformPostId: mediaId,
        platformUrl: `https://www.instagram.com/p/${mediaId}/`,
        provider: "instagram",
        content: caption,
        mediaUrls: [imageUrl],
        mediaType: "image",
      };
    } catch (error) {
      this.logError("Photo publish failed", error);
      throw error;
    }
  }

  /**
   * Validate video URL before uploading (OPTIONAL - NON-BLOCKING)
   */
  async validateVideoUrl(videoUrl) {
    try {
      // Check if URL is HTTPS
      if (!videoUrl.startsWith("https://")) {
        this.log(
          "⚠️ Warning: Video URL is not HTTPS, Instagram may reject it",
          { videoUrl }
        );
        // Don't throw error, just warn
        return false;
      }

      // Quick check (3 second timeout)
      const response = await axios.head(videoUrl, {
        timeout: 3000, // ✅ Reduced from 10s to 3s
        validateStatus: (status) => status < 500, // Accept any status < 500
      });

      if (response.status !== 200) {
        this.log("⚠️ Warning: Video URL returned non-200 status", {
          status: response.status,
          url: videoUrl,
        });
        return false;
      }

      this.log("✅ Video URL validation passed", {
        url: videoUrl,
        contentType: response.headers["content-type"],
        size: response.headers["content-length"]
          ? `${(
              parseInt(response.headers["content-length"]) /
              1024 /
              1024
            ).toFixed(2)}MB`
          : "unknown",
      });

      return true;
    } catch (error) {
      // ✅ DON'T THROW ERROR - Just log warning and continue
      this.log("⚠️ Video URL validation failed (non-blocking)", {
        url: videoUrl,
        error: error.message,
      });
      return false;
    }
  }

  /**
 * Enhanced video validation with duration check
 */
async validateVideoUrl(videoUrl) {
  try {
    if (!videoUrl.startsWith("https://")) {
      this.log("⚠️ Warning: Video URL is not HTTPS", { videoUrl });
      return false;
    }

    // Check video headers
    const response = await axios.head(videoUrl, {
      timeout: 5000,
      validateStatus: (status) => status < 500,
      maxRedirects: 0, // ✅ Reject redirects
    });

    if (response.status !== 200) {
      this.log("⚠️ Warning: Video URL returned non-200 status", {
        status: response.status,
        url: videoUrl,
      });
      return false;
    }

    // Check content type
    const contentType = response.headers["content-type"];
    if (!contentType || !contentType.includes("video")) {
      this.log("⚠️ Warning: URL does not return video content", {
        contentType,
        url: videoUrl,
      });
      return false;
    }

    // Check file size (max 100MB)
    const contentLength = parseInt(response.headers["content-length"] || "0");
    const fileSizeMB = contentLength / 1024 / 1024;

    if (fileSizeMB > 100) {
      throw new Error(
        `❌ Video file is too large: ${fileSizeMB.toFixed(2)}MB (max 100MB)`
      );
    }

    this.log("✅ Video URL validation passed", {
      url: videoUrl,
      contentType,
      size: `${fileSizeMB.toFixed(2)}MB`,
    });

    return true;
  } catch (error) {
    if (error.message.includes("too large")) {
      throw error; // Re-throw size errors
    }

    this.log("⚠️ Video URL validation failed (non-blocking)", {
      url: videoUrl,
      error: error.message,
    });
    return false;
  }
}

/**
 * Publish single video or reel
 * Automatically detects if video should be published as REELS or VIDEO
 */
async publishVideo(caption, videoUrl, accessToken, config) {
  try {
    this.log("Publishing video", { videoUrl });

    // Support for local video files
    let videoSource = videoUrl;

    if (!videoUrl.startsWith("http") && !videoUrl.startsWith("/")) {
      const path = require("path");
      videoSource = `${process.env.APP_URL}/uploads/media/${path.basename(
        videoUrl
      )}`;

      this.log("Converted local video path to URL", {
        original: videoUrl,
        converted: videoSource,
      });
    }

    // ✅ ADD: Extract video metadata from URL if it's a Cloudinary URL
    let videoDuration = null;
    if (videoSource.includes('cloudinary.com')) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = videoSource.split('/');
        const publicIdWithExt = urlParts[urlParts.length - 1];
        const publicId = `${urlParts[urlParts.length - 2]}/${publicIdWithExt.split('.')[0]}`;
        
        this.log("Fetching video metadata from Cloudinary", { publicId });
        
        const cloudinary = require('../config/cloudinary');
        const videoInfo = await cloudinary.api.resource(publicId, {
          resource_type: 'video'
        });
        
        videoDuration = videoInfo.duration;
        
        this.log("Video metadata retrieved", {
          duration: videoDuration,
          format: videoInfo.format,
          width: videoInfo.width,
          height: videoInfo.height,
          bitRate: videoInfo.bit_rate,
        });
        
        // ✅ VALIDATE DURATION
        if (videoDuration < 3 || videoDuration > 60) {
          throw new Error(
            `❌ Video duration (${videoDuration.toFixed(1)}s) is outside Instagram's 3-60 second range.\n\n` +
            `Instagram Requirements:\n` +
            `• FEED Videos: EXACTLY 3-60 seconds\n` +
            `• REELS: EXACTLY 3-90 seconds\n\n` +
            `Your video is ${videoDuration.toFixed(1)} seconds.\n\n` +
            `🛠️ FIX:\n` +
            `1. Trim video to 3-60 seconds\n` +
            `2. Use ffmpeg: ffmpeg -i input.mp4 -t 30 output.mp4`
          );
        }
        
        this.log(`✅ Video duration is valid: ${videoDuration.toFixed(1)}s`);
        
      } catch (metadataError) {
        this.logError("Failed to fetch video metadata", metadataError);
        // Continue anyway - Instagram will validate
      }
    }

    // Detect video orientation
    const isVertical = this.isVerticalVideo(videoSource);
    const mediaType = isVertical ? "REELS" : "VIDEO";

    this.log("Detected video type", {
      mediaType,
      isVertical,
      duration: videoDuration ? `${videoDuration.toFixed(1)}s` : 'unknown',
      videoUrl: videoSource,
    });

    // Log the exact request to Instagram
    this.log("📤 Sending video container request to Instagram", {
      endpoint: `${config.apiUrl}/${this.channel.platformUserId}/media`,
      mediaType,
      videoUrl: videoSource,
      captionLength: caption.length,
      videoDuration: videoDuration ? `${videoDuration.toFixed(1)}s` : 'unknown',
    });


    // Step 1: Create video/reel container
    const containerParams = {
      media_type: mediaType,
      video_url: videoSource,
      caption: caption,
      access_token: accessToken,
    };

    // Add REELS-specific parameters
    if (mediaType === "REELS") {
      containerParams.share_to_feed = true;
    }

    const containerResponse = await axios.post(
      `${config.apiUrl}/${this.channel.platformUserId}/media`,
      null,
      {
        params: containerParams,
        timeout: 30000,
      }
    );

    const containerId = containerResponse.data.id;
    this.log(`✅ ${mediaType} container created`, { containerId });

    // Step 2: Wait for video processing (can take 1-2 minutes)
    this.log("⏳ Waiting for Instagram to process video...");
    
    await this.waitForMediaProcessing(
      containerId,
      accessToken,
      config,
      mediaType === "REELS" ? 180000 : 120000 // 3 min for reels, 2 min for video
    );

    this.log("✅ Video processing completed");

    // Step 3: Publish container
    this.log("📤 Publishing to Instagram feed...");
    
    const publishResponse = await axios.post(
      `${config.apiUrl}/${this.channel.platformUserId}/media_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: accessToken,
        },
      }
    );

    const mediaId = publishResponse.data.id;
    this.log(`🎉 ${mediaType} published successfully`, { mediaId });

    return {
      success: true,
      platformPostId: mediaId,
      platformUrl: `https://www.instagram.com/p/${mediaId}/`,
      provider: "instagram",
      content: caption,
      mediaUrls: [videoUrl],
      mediaType: mediaType.toLowerCase(),
    };
  } catch (error) {
    this.logError("❌ Video publish failed", error);

    // Better error messages
    if (error.response?.data?.error) {
      const fbError = error.response.data.error;

      this.logError("Instagram API Error Details", {
        message: fbError.message,
        type: fbError.type,
        code: fbError.code,
        error_subcode: fbError.error_subcode,
        fbtrace_id: fbError.fbtrace_id,
      });

      // Error code 100: Invalid parameter
      if (fbError.code === 100 || fbError.message?.includes("Invalid parameter")) {
        throw new Error(
          "❌ Instagram Video Upload Failed: Invalid Parameter\n\n" +
          "🔍 COMMON CAUSES:\n" +
          "1. Video duration is NOT 3-60 seconds (for feed) or 3-90 seconds (for reels)\n" +
          "2. Video URL redirects (Instagram requires direct URLs)\n" +
          "3. Video codec is not H.264 or audio is not AAC\n" +
          "4. Video bitrate is too high (>5000 kbps)\n" +
          "5. Video has variable frame rate (must be constant)\n\n" +
          "📋 Instagram Requirements:\n" +
          "FEED VIDEOS:\n" +
          "• Duration: EXACTLY 3-60 seconds (not 60.1s!)\n" +
          "• Resolution: 600x315px to 1920x1080px\n" +
          "• Aspect Ratio: 0.8:1 to 1.91:1\n\n" +
          "REELS:\n" +
          "• Duration: EXACTLY 3-90 seconds\n" +
          "• Resolution: 1080x1920px (9:16)\n" +
          "• Aspect Ratio: More flexible\n\n" +
          "BOTH:\n" +
          "• Format: MP4 (H.264 video codec, AAC audio codec)\n" +
          "• Frame Rate: Constant, max 60 FPS\n" +
          "• Bitrate: Max 5000 kbps\n" +
          "• File Size: Max 100MB\n" +
          "• URL: Direct HTTPS, no redirects\n\n" +
          `📊 Your Video: ${videoUrl}\n\n` +
          "✅ TESTED WORKING VIDEOS:\n" +
          "• https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4\n" +
          "• Upload to: AWS S3, Cloudinary, or Imgur\n\n" +
          "🛠️ FIX WITH FFMPEG:\n" +
          "ffmpeg -i input.mp4 -t 30 -c:v libx264 -preset slow -crf 22 \\\n" +
          "  -c:a aac -b:a 128k -ar 44100 -r 30 -vf scale=1280:720 output.mp4"
        );
      }

      // Error code 352/2207026: Invalid video format
      if (fbError.code === 352 || fbError.error_subcode === 2207026) {
        throw new Error(
          "❌ Invalid Video Format\n\n" +
          "Instagram rejected the video file format.\n\n" +
          "🛠️ Convert video:\n" +
          "ffmpeg -i input.mp4 -c:v libx264 -preset slow -crf 22 \\\n" +
          "  -c:a aac -b:a 128k -profile:v baseline -level 3.0 output.mp4"
        );
      }
    }

    throw error;
  }
}

/**
 * Wait for Instagram to process media with better error handling
 */
async waitForMediaProcessing(
  containerId,
  accessToken,
  config,
  maxWait = 120000
) {
  const startTime = Date.now();
  const pollInterval = 5000;
  let attemptCount = 0;

  this.log("Polling for media processing status...", { containerId, maxWait });

  while (Date.now() - startTime < maxWait) {
    attemptCount++;

    try {
      const statusResponse = await axios.get(
        `${config.apiUrl}/${containerId}`,
        {
          params: {
            fields: "status_code",
            access_token: accessToken,
          },
        }
      );

      const statusCode = statusResponse.data.status_code;

      this.log(`Attempt ${attemptCount}: Status = ${statusCode}`, {
        containerId,
        elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      });

      if (statusCode === "FINISHED") {
        this.log("✅ Media processing completed", { containerId, attemptCount });
        return true;
      }

      if (statusCode === "ERROR") {
        throw new Error(
          "❌ Instagram media processing failed\n\n" +
          "Possible reasons:\n" +
          "1. Video duration is outside 3-60 seconds range\n" +
          "2. Video codec/format is incompatible\n" +
          "3. Video URL is not accessible to Instagram servers\n" +
          "4. Video exceeds 100MB size limit\n\n" +
          "Try:\n" +
          "• Upload video to a different CDN (S3, Cloudinary)\n" +
          "• Re-encode video with ffmpeg (see docs)\n" +
          "• Use a shorter video (10-30 seconds is safest)"
        );
      }

      // Status is IN_PROGRESS, wait and retry
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      if (error.response?.status === 400) {
        this.log(`Attempt ${attemptCount}: Container not ready yet`, {
          containerId,
        });
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      // Re-throw our custom errors
      if (error.message.includes("❌")) {
        throw error;
      }

      throw error;
    }
  }

  throw new Error(
    `❌ Media processing timeout after ${maxWait / 1000}s\n\n` +
    "Instagram took too long to process the video.\n\n" +
    "This usually means:\n" +
    "1. Video is too large (reduce to <50MB)\n" +
    "2. Video encoding is complex (use simpler encoding)\n" +
    "3. Instagram servers are slow (try again later)\n\n" +
    "Try a shorter, simpler video file."
  );
}

/**
 * Helper: Detect if video is vertical (for REELS) or horizontal (for VIDEO)
 */
isVerticalVideo(videoUrl) {
  // Check filename patterns
  if (videoUrl.match(/1080x1920|1080_1920|portrait|vertical|reel/i)) {
    return true;
  }

  if (videoUrl.match(/1920x1080|1920_1080|landscape|horizontal/i)) {
    return false;
  }

  if (videoUrl.includes("_9_16") || videoUrl.includes("9-16")) {
    return true;
  }

  // Default to false (landscape) for feed videos
  return false;
}

  /**
   * Publish carousel (2-10 items)
   */
  async publishCarousel(caption, mediaUrls, accessToken, config) {
    try {
      this.log("Publishing carousel", { itemCount: mediaUrls.length });

      const containerIds = [];

      // Step 1: Create containers for each item
      for (const mediaUrl of mediaUrls.slice(0, 10)) {
        const isVideo = /\.(mp4|mov)$/i.test(mediaUrl);

        const containerResponse = await axios.post(
          `${config.apiUrl}/${this.channel.platformUserId}/media`,
          null,
          {
            params: isVideo
              ? {
                  media_type: "VIDEO",
                  video_url: mediaUrl,
                  is_carousel_item: true,
                  access_token: accessToken,
                }
              : {
                  image_url: mediaUrl,
                  is_carousel_item: true,
                  access_token: accessToken,
                },
          }
        );

        containerIds.push(containerResponse.data.id);
        this.log(`Carousel item ${containerIds.length} created`, {
          containerId: containerResponse.data.id,
        });

        // Wait between items to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Step 2: Wait for all items to process
      await Promise.all(
        containerIds.map((id) =>
          this.waitForMediaProcessing(id, accessToken, config, 60000)
        )
      );

      // Step 3: Create carousel container
      const carouselResponse = await axios.post(
        `${config.apiUrl}/${this.channel.platformUserId}/media`,
        null,
        {
          params: {
            media_type: "CAROUSEL",
            children: containerIds.join(","),
            caption: caption,
            access_token: accessToken,
          },
        }
      );

      const carouselId = carouselResponse.data.id;
      this.log("Carousel container created", { carouselId });

      // Step 4: Publish carousel
      const publishResponse = await axios.post(
        `${config.apiUrl}/${this.channel.platformUserId}/media_publish`,
        null,
        {
          params: {
            creation_id: carouselId,
            access_token: accessToken,
          },
        }
      );

      const mediaId = publishResponse.data.id;
      this.log("Carousel published", { mediaId });

      return {
        success: true,
        platformPostId: mediaId,
        platformUrl: `https://www.instagram.com/p/${mediaId}/`,
        provider: "instagram",
        content: caption,
        mediaUrls: mediaUrls,
        mediaType: "carousel",
      };
    } catch (error) {
      this.logError("Carousel publish failed", error);
      throw error;
    }
  }

  /**
   * Wait for Instagram to process media
   */
  async waitForMediaProcessing(
    containerId,
    accessToken,
    config,
    maxWait = 60000
  ) {
    const startTime = Date.now();
    const pollInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < maxWait) {
      try {
        const statusResponse = await axios.get(
          `${config.apiUrl}/${containerId}`,
          {
            params: {
              fields: "status_code",
              access_token: accessToken,
            },
          }
        );

        const statusCode = statusResponse.data.status_code;

        if (statusCode === "FINISHED") {
          this.log("Media processing completed", { containerId });
          return true;
        }

        if (statusCode === "ERROR") {
          throw new Error("Instagram media processing failed");
        }

        // Status is IN_PROGRESS, wait and retry
        this.log("Waiting for processing...", { containerId, statusCode });
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (error.response?.status === 400) {
          // Container might not be queryable yet, continue waiting
          this.log("Container not ready, retrying...", { containerId });
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue;
        }
        throw error;
      }
    }

    throw new Error("Media processing timeout - Instagram took too long");
  }

  /**
   * Update post - NOT SUPPORTED
   */
  async updatePost(platformPostId, newContent) {
    throw new Error(
      "❌ Instagram does not support editing published posts.\n\n" +
        "📱 Instagram API Limitation:\n" +
        "Instagram's official API does not allow editing captions or media after publishing.\n\n" +
        "✅ Alternatives:\n" +
        "1. Delete the post and republish with new content\n" +
        "2. Edit the caption manually in the Instagram app\n" +
        "3. Post a comment with updated information\n\n" +
        "This is a limitation of Instagram's platform, not our application."
    );
  }

  /**
   * Delete post
   */
  async deletePost(platformPostId) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      this.log("Attempting to delete Instagram post", {
        platformPostId,
        accountId: this.channel.platformUserId,
      });

      await axios.delete(`${config.apiUrl}/${platformPostId}`, {
        params: {
          access_token: accessToken,
        },
      });

      this.log("Post deleted successfully", { platformPostId });

      return {
        success: true,
      };
    } catch (error) {
      this.logError("Delete failed", error);

      // error messages for Instagram-specific issues
      if (error.response?.status === 400) {
        const errorMessage =
          error.response.data?.error?.message || "Unknown error";
        const errorCode = error.response.data?.error?.code;

        // Instagram-specific error handling
        if (errorCode === 100 || errorMessage.includes("unknown error")) {
          throw new Error(
            `Instagram post cannot be deleted. Possible reasons:\n` +
              `1. This post was not created by your app\n` +
              `2. The post was created with a different access token\n` +
              `3. Instagram has rate-limited deletion requests\n` +
              `4. The post is too old to delete (>24 hours)\n\n` +
              `Instagram only allows deletion of posts created by your app via API.`
          );
        }

        if (errorCode === 190) {
          throw new Error(
            "Instagram access token is invalid or expired. Please reconnect your account."
          );
        }

        if (errorCode === 803) {
          throw new Error(
            "Instagram post has already been deleted or does not exist."
          );
        }

        throw new Error(
          `Instagram API error: ${errorMessage} (Code: ${errorCode})`
        );
      }

      if (error.response?.status === 403) {
        throw new Error(
          "Instagram deletion forbidden. This post was likely not created by your app."
        );
      }

      if (error.response?.status === 404) {
        throw new Error(
          "Instagram post not found. It may have already been deleted."
        );
      }

      throw new Error(
        `Instagram delete failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Get published posts
   */
  async getPosts(options = {}) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();
      const limit = Math.min(options.limit || 25, 100);

      const response = await axios.get(
        `${config.apiUrl}/${this.channel.platformUserId}/media`,
        {
          params: {
            fields:
              "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
            limit: limit,
            access_token: accessToken,
          },
        }
      );

      const media = response.data.data || [];

      this.log("Posts retrieved", { count: media.length });

      return media.map((item) => ({
        platformPostId: item.id,
        content: item.caption || "",
        platformUrl: item.permalink,
        publishedAt: new Date(item.timestamp),
        mediaUrls: [item.media_url || item.thumbnail_url],
        mediaType: item.media_type.toLowerCase(),
        analytics: {
          likes: item.like_count || 0,
          comments: item.comments_count || 0,
        },
      }));
    } catch (error) {
      this.logError("Get posts failed", error);
      throw new Error(
        `Instagram get posts failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Get post analytics
   */
  async getPostAnalytics(platformPostId) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.get(
        `${config.apiUrl}/${platformPostId}/insights`,
        {
          params: {
            metric: "engagement,impressions,reach,saved",
            access_token: accessToken,
          },
        }
      );

      const insights = response.data.data || [];
      const analytics = {};

      insights.forEach((insight) => {
        analytics[insight.name] = insight.values[0]?.value || 0;
      });

      return {
        likes: analytics.engagement || 0,
        impressions: analytics.impressions || 0,
        reach: analytics.reach || 0,
        saved: analytics.saved || 0,
      };
    } catch (error) {
      this.logError("Get analytics failed", error);
      return null;
    }
  }
}

module.exports = InstagramProvider;

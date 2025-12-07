const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const FormData = require("form-data");
const BaseProvider = require("./baseProvider");

class YouTubeProvider extends BaseProvider {
  getConfig() {
    return {
      clientId: process.env.YOUTUBE_CLIENT_ID,
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
      callbackUrl: process.env.YOUTUBE_CALLBACK_URL,
      apiKey: process.env.YOUTUBE_API_KEY,

      // OAuth URLs
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",

      // YouTube API URLs
      apiUrl: "https://www.googleapis.com/youtube/v3",
      uploadUrl: "https://www.googleapis.com/upload/youtube/v3/videos",

      // Scopes
      scopes: (
        process.env.YOUTUBE_SCOPES ||
        "https://www.googleapis.com/auth/youtube.upload," +
        "https://www.googleapis.com/auth/youtube," +
        "https://www.googleapis.com/auth/youtube.readonly"
      ).split(","),

      // Settings
      defaultCategory: parseInt(process.env.YOUTUBE_DEFAULT_CATEGORY) || 22,
      defaultPrivacy: process.env.YOUTUBE_DEFAULT_PRIVACY || "private",
      maxFileSizeMB: parseInt(process.env.YOUTUBE_MAX_FILE_SIZE_MB) || 2048,
    };
  }

  getAuthorizationUrl(state) {
    const config = this.getConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      response_type: "code",
      scope: config.scopes.join(" "),
      state: state,
      access_type: "offline", // Get refresh token
      prompt: "consent", // Force consent screen to get refresh token
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  async handleCallback(code) {
    const config = this.getConfig();

    try {
      // Exchange code for tokens
      const tokenResponse = await axios.post(config.tokenUrl, {
        code: code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        grant_type: "authorization_code",
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      this.log("YouTube tokens received", {
        hasRefreshToken: !!refresh_token,
        expiresIn: expires_in,
      });

      // Get channel info
      const channelResponse = await axios.get(`${config.apiUrl}/channels`, {
        params: {
          part: "snippet,contentDetails,statistics",
          mine: true,
        },
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const channel = channelResponse.data.items[0];

      if (!channel) {
        throw new Error("No YouTube channel found for this account");
      }

      this.log("YouTube channel connected", {
        title: channel.snippet.title,
        subscribers: channel.statistics.subscriberCount,
      });

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        platformUserId: channel.id,
        platformUsername: channel.snippet.customUrl || channel.id,
        displayName: channel.snippet.title,
        profileUrl: `https://www.youtube.com/channel/${channel.id}`,
        avatar: channel.snippet.thumbnails?.default?.url,
        providerData: {
          subscribers: parseInt(channel.statistics.subscriberCount) || 0,
          videoCount: parseInt(channel.statistics.videoCount) || 0,
          viewCount: parseInt(channel.statistics.viewCount) || 0,
          uploads: channel.contentDetails?.relatedPlaylists?.uploads,
        },
      };
    } catch (error) {
      this.logError("YouTube OAuth failed", error);
      throw new Error(
        `YouTube OAuth failed: ${
          error.response?.data?.error_description || error.message
        }`
      );
    }
  }

  async refreshAccessToken() {
    const config = this.getConfig();
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    try {
      const response = await axios.post(config.tokenUrl, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });

      const { access_token, expires_in } = response.data;

      this.log("YouTube token refreshed", {
        expiresIn: expires_in,
      });

      return {
        accessToken: access_token,
        expiresIn: expires_in,
      };
    } catch (error) {
      this.logError("Token refresh failed", error);
      throw new Error("Failed to refresh YouTube access token");
    }
  }

  async testConnection() {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.get(`${config.apiUrl}/channels`, {
        params: {
          part: "snippet",
          mine: true,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.status === 200 && response.data.items?.length > 0;
    } catch (error) {
      this.logError("Connection test failed", error);
      return false;
    }
  }

  /**
   * Get media buffer from URL or file path
   */
  async getMediaBuffer(mediaSource) {
    // URL
    if (typeof mediaSource === "string" && /^https?:\/\//i.test(mediaSource)) {
      this.log("Downloading video from URL", { url: mediaSource });
      const response = await axios.get(mediaSource, {
        responseType: "arraybuffer",
        timeout: 300000, // 5 minutes for large videos
        maxContentLength: this.getConfig().maxFileSizeMB * 1024 * 1024,
      });
      return {
        buffer: Buffer.from(response.data),
        contentType: response.headers["content-type"],
      };
    }

    // Local file
    if (typeof mediaSource === "string" && !mediaSource.startsWith("http")) {
      this.log("Reading local video file", { path: mediaSource });
      const buffer = await fs.readFile(mediaSource);
      const ext = path.extname(mediaSource).toLowerCase();
      const contentType = this.getContentTypeFromExtension(ext);
      return { buffer, contentType };
    }

    // Buffer
    if (Buffer.isBuffer(mediaSource)) {
      return {
        buffer: mediaSource,
        contentType: "video/mp4",
      };
    }

    throw new Error("Invalid media source: must be URL, file path, or Buffer");
  }

  getContentTypeFromExtension(ext) {
    const mimeTypes = {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".wmv": "video/x-ms-wmv",
      ".flv": "video/x-flv",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
    };
    return mimeTypes[ext] || "video/mp4";
  }

  /**
   * Publish video to YouTube
   *
   * YouTube Video Requirements:
   * - Regular Videos: Any duration, any aspect ratio
   * - Shorts: Max 60 seconds, vertical (9:16), must include "#Shorts"
   */
  async publish(post) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      // Validate content
      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        throw new Error(
          "YouTube requires a video file. Text-only posts are not supported."
        );
      }

      const videoUrl = post.mediaUrls[0];
      const title = post.title || post.content.substring(0, 100);
      
      // Combine content and hashtags for the description
      let description = post.content;
      if (post.hashtags && post.hashtags.length > 0) {
        description += `\n\n${post.hashtags.join(' ')}`;
      }

      // CHECK IF USER WANTS TO PUBLISH AS SHORT
      const isShort =
        post.metadata?.youtube?.publishAsShort === true ||
        description.includes("#Shorts") ||
        title.includes("#Shorts");

      this.log("Publishing video to YouTube", {
        title: title.substring(0, 50) + "...",
        descriptionLength: description.length,
        videoUrl: videoUrl.substring(0, 50) + "...",
        publishAsShort: isShort,
      });

      // Get video buffer
      const { buffer, contentType } = await this.getMediaBuffer(videoUrl);

      // Check file size
      const fileSizeMB = buffer.length / 1024 / 1024;
      if (fileSizeMB > config.maxFileSizeMB) {
        throw new Error(
          `Video too large: ${fileSizeMB.toFixed(2)}MB. Max size: ${
            config.maxFileSizeMB
          }MB`
        );
      }

      this.log("Video loaded", {
        size: `${fileSizeMB.toFixed(2)}MB`,
        contentType,
      });

      // PREPARE METADATA WITH SHORTS SUPPORT
      let finalTitle = title;
      let finalDescription = description;

      if (isShort) {
        // Add #Shorts to title if not present
        if (
          !finalTitle.includes("#Shorts") &&
          !finalTitle.includes("#shorts")
        ) {
          finalTitle = `${finalTitle} #Shorts`;
        }

        // Add #Shorts to description if not present
        if (
          !finalDescription.includes("#Shorts") &&
          !finalDescription.includes("#shorts")
        ) {
          finalDescription = `${finalDescription}\n\n#Shorts`;
        }

        this.log("Video will be published as YouTube Short", {
          originalTitle: title,
          modifiedTitle: finalTitle,
        });
      }

      const metadata = {
        snippet: {
          title: finalTitle,
          description: finalDescription,
          categoryId: config.defaultCategory.toString(),
          tags: this.extractTags(finalDescription),
        },
        status: {
          privacyStatus:
            post.metadata?.youtube?.privacyStatus || config.defaultPrivacy,
          selfDeclaredMadeForKids: false,
        },
      };

      // Upload video to YouTube (resumable upload)
      this.log("Starting YouTube video upload...");

      const uploadResponse = await this.uploadVideoResumable(
        buffer,
        metadata,
        accessToken,
        config
      );

      const videoId = uploadResponse.id;

      this.log("Video uploaded successfully", {
        videoId,
        title: uploadResponse.snippet.title,
        privacyStatus: uploadResponse.status.privacyStatus,
        isShort: isShort,
      });

      return {
        success: true,
        platformPostId: videoId,
        platformUrl: `https://www.youtube.com/watch?v=${videoId}`,
        provider: "youtube",
        content: finalDescription,
        title: finalTitle,
        mediaUrls: [videoUrl],
        mediaType: isShort ? "short" : "video",
        providerData: {
          privacyStatus: uploadResponse.status.privacyStatus,
          embeddable: uploadResponse.status.embeddable,
          isShort: isShort,
        },
      };
    } catch (error) {
      this.logError("YouTube publish failed", error);

      if (error.response?.data?.error) {
        const ytError = error.response.data.error;
        this.logError("YouTube API Error Details", {
          code: ytError.code,
          message: ytError.message,
          errors: ytError.errors,
        });
      }

      throw new Error(
        `YouTube upload failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Upload video using resumable upload (for large files)
   */
  async uploadVideoResumable(buffer, metadata, accessToken, config) {
    try {
      // Step 1: Initialize resumable upload session
      const initResponse = await axios.post(
        `${config.uploadUrl}?uploadType=resumable&part=snippet,status`,
        metadata,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "video/*",
            "X-Upload-Content-Length": buffer.length,
          },
        }
      );

      const uploadUrl = initResponse.headers.location;

      if (!uploadUrl) {
        throw new Error("Failed to get resumable upload URL from YouTube");
      }

      this.log("Resumable upload session created", {
        uploadUrl: uploadUrl.substring(0, 50) + "...",
      });

      // Step 2: Upload video content
      const uploadResponse = await axios.put(uploadUrl, buffer, {
        headers: {
          "Content-Type": "video/*",
          "Content-Length": buffer.length,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 600000, // 10 minutes
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          this.log(`Upload progress: ${percentCompleted}%`);
        },
      });

      return uploadResponse.data;
    } catch (error) {
      this.logError("Resumable upload failed", error);
      throw error;
    }
  }

  /**
   * Extract hashtags from description
   */
  extractTags(description) {
    const tagRegex = /#(\w+)/g;
    const tags = [];
    let match;

    while ((match = tagRegex.exec(description)) !== null) {
      tags.push(match[1]);
    }

    return tags.slice(0, 15); // YouTube allows max 15 tags
  }

  /**
   * Update video metadata (title, description, privacy)
   */
  async updatePost(platformPostId, newContent) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      // Handle both string content and object with content property
      const content =
        typeof newContent === "string"
          ? newContent
          : newContent.content || newContent.description || "";

      const title = newContent.title || content.substring(0, 100);

      // Ensure content exists
      if (!content) {
        throw new Error("Content is required for video update");
      }

      this.log("Updating YouTube video", {
        videoId: platformPostId,
        contentLength: content.length,
        titleLength: title.length,
      });

      const updateResponse = await axios.put(
        `${config.apiUrl}/videos`,
        {
          id: platformPostId,
          snippet: {
            title: title,
            description: content,
            categoryId: config.defaultCategory.toString(),
            tags: this.extractTags(content),
          },
        },
        {
          params: {
            part: "snippet",
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      this.log("Video updated successfully", {
        videoId: platformPostId,
      });

      return {
        success: true,
        platformPostId: platformPostId,
        platformUrl: `https://www.youtube.com/watch?v=${platformPostId}`,
      };
    } catch (error) {
      this.logError("YouTube update failed", error);

      // Better error messages
      if (error.response?.data?.error) {
        const ytError = error.response.data.error;
        throw new Error(
          `YouTube update failed: ${ytError.message}\n` +
            `Details: ${
              ytError.errors?.map((e) => e.message).join(", ") ||
              "Unknown error"
            }`
        );
      }

      throw new Error(`YouTube update failed: ${error.message}`);
    }
  }

  /**
   * Delete video from YouTube
   */
  async deletePost(platformPostId) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      this.log("Deleting YouTube video", { videoId: platformPostId });

      await axios.delete(`${config.apiUrl}/videos`, {
        params: {
          id: platformPostId,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      this.log("Video deleted successfully", { videoId: platformPostId });

      return { success: true };
    } catch (error) {
      this.logError("YouTube delete failed", error);
      throw new Error(
        `YouTube delete failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Get uploaded videos
   */
  async getPosts(options = {}) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();
      const limit = options.limit || 50;

      const response = await axios.get(`${config.apiUrl}/search`, {
        params: {
          part: "snippet",
          forMine: true,
          type: "video",
          maxResults: limit,
          order: "date",
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data.items.map((item) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnails: item.snippet.thumbnails,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }));
    } catch (error) {
      this.logError("Failed to get videos", error);
      throw new Error("Failed to retrieve YouTube videos");
    }
  }

  /**
   * Get video analytics
   */
  async getPostAnalytics(platformPostId) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.get(`${config.apiUrl}/videos`, {
        params: {
          part: "statistics",
          id: platformPostId,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const video = response.data.items[0];

      if (!video) {
        throw new Error("Video not found");
      }

      return {
        videoId: platformPostId,
        views: parseInt(video.statistics.viewCount) || 0,
        likes: parseInt(video.statistics.likeCount) || 0,
        dislikes: parseInt(video.statistics.dislikeCount) || 0,
        comments: parseInt(video.statistics.commentCount) || 0,
        favorites: parseInt(video.statistics.favoriteCount) || 0,
      };
    } catch (error) {
      this.logError("Failed to get video analytics", error);
      throw new Error("Failed to retrieve video analytics");
    }
  }
}

module.exports = YouTubeProvider;

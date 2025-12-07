const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const BaseProvider = require("../providers/baseProvider");

class LinkedInProvider extends BaseProvider {
  getConfig() {
    return {
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackUrl: process.env.LINKEDIN_CALLBACK_URL,
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      apiUrl: "https://api.linkedin.com/rest",
      apiVersion: "202510",
      scopes: ["openid", "profile", "email", "w_member_social"],
    };
  }

  getAuthorizationUrl(state) {
    const config = this.getConfig();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      state: state,
      scope: config.scopes.join(" "),
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  async handleCallback(code) {
    const config = this.getConfig();

    try {
      const tokenResponse = await axios.post(
        config.tokenUrl,
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: config.callbackUrl,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const { access_token, expires_in } = tokenResponse.data;

      const profileResponse = await axios.get(
        "https://api.linkedin.com/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      );

      const profile = profileResponse.data;

      return {
        accessToken: access_token,
        refreshToken: null,
        expiresIn: expires_in,
        platformUserId: profile.sub,
        displayName: profile.name,
        profileUrl: `https://www.linkedin.com/in/${
          profile.given_name || profile.sub
        }`,
        avatar: profile.picture,
      };
    } catch (error) {
      this.logError("OAuth callback", error);
      throw new Error(
        `LinkedIn OAuth failed: ${
          error.response?.data?.error_description || error.message
        }`
      );
    }
  }

  async refreshAccessToken() {
    throw new Error(
      "LinkedIn does not support token refresh. Please reconnect your account."
    );
  }

  async testConnection() {
    try {
      const accessToken = this.getAccessToken();

      const response = await axios.get("https://api.linkedin.com/v2/userinfo", {
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

  async getMediaBuffer(mediaSource) {
    if (typeof mediaSource === "string" && /^https?:\/\//i.test(mediaSource)) {
      this.log("Downloading from URL", { url: mediaSource });
      const response = await axios.get(mediaSource, {
        responseType: "arraybuffer",
      });
      return {
        buffer: Buffer.from(response.data),
        contentType: response.headers["content-type"],
      };
    }

    if (typeof mediaSource === "string" && !mediaSource.startsWith("http")) {
      this.log("Reading local file", { path: mediaSource });
      const buffer = await fs.readFile(mediaSource);
      const ext = path.extname(mediaSource).toLowerCase();
      const contentType = this.getContentTypeFromExtension(ext);
      return { buffer, contentType };
    }

    if (Buffer.isBuffer(mediaSource)) {
      this.log("Using provided buffer");
      return { buffer: mediaSource, contentType: "application/octet-stream" };
    }

    throw new Error("Invalid media source: must be URL, file path, or Buffer");
  }

  getContentTypeFromExtension(ext) {
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".wmv": "video/x-ms-wmv",
    };
    return mimeTypes[ext] || "application/octet-stream";
  }

  async uploadImage(mediaSource) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const initResponse = await axios.post(
        `${config.apiUrl}/images?action=initializeUpload`,
        {
          initializeUploadRequest: {
            owner: `urn:li:person:${this.channel.platformUserId}`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "LinkedIn-Version": config.apiVersion,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      const uploadUrl = initResponse.data.value.uploadUrl;
      const imageUrn = initResponse.data.value.image;

      const { buffer, contentType } = await this.getMediaBuffer(mediaSource);

      await axios.put(uploadUrl, buffer, {
        headers: {
          "Content-Type": contentType,
        },
      });

      this.log("Image uploaded", { imageUrn, size: buffer.length });

      // Wait for LinkedIn to process the image (2-5 seconds)
      await this.waitForMediaProcessing(imageUrn, 'image');

      return imageUrn;
    } catch (error) {
      this.logError("Image upload failed", error);
      throw new Error(
        `LinkedIn image upload failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  async uploadVideo(mediaSource) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      // Step 1: Get video buffer and metadata
      const { buffer, contentType } = await this.getMediaBuffer(mediaSource);

      this.log("Video file loaded", {
        size: buffer.length,
        contentType,
        sizeMB: (buffer.length / 1024 / 1024).toFixed(2),
      });

      // Step 2: Register video upload
      const registerResponse = await axios.post(
        `${config.apiUrl}/videos?action=initializeUpload`,
        {
          initializeUploadRequest: {
            owner: `urn:li:person:${this.channel.platformUserId}`,
            fileSizeBytes: buffer.length,
            uploadCaptions: false,
            uploadThumbnail: false,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "LinkedIn-Version": config.apiVersion,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      this.log("Video upload initialized", registerResponse.data);

      const { value } = registerResponse.data;
      const uploadInstructions = value.uploadInstructions;
      const videoUrn = value.video;
      const uploadToken = value.uploadToken;

      if (!uploadInstructions || uploadInstructions.length === 0) {
        throw new Error("No upload instructions received from LinkedIn");
      }

      // Step 3: Upload video parts and collect ETags
      const uploadedPartIds = [];

      for (let i = 0; i < uploadInstructions.length; i++) {
        const instruction = uploadInstructions[i];
        const { uploadUrl, firstByte, lastByte } = instruction;

        // Extract the chunk for this part
        const start = firstByte || 0;
        const end = lastByte ? lastByte + 1 : buffer.length;
        const chunk = buffer.slice(start, end);

        this.log(`Uploading part ${i + 1}/${uploadInstructions.length}`, {
          size: chunk.length,
          range: `${start}-${end - 1}`,
        });

        // Upload the chunk
        const uploadResponse = await axios.put(uploadUrl, chunk, {
          headers: {
            "Content-Type": contentType || "application/octet-stream",
            ...(instruction.headers || {}),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        // Get ETag from response headers (CRITICAL!)
        const etag = uploadResponse.headers["etag"];
        if (etag) {
          uploadedPartIds.push(etag.replace(/"/g, "")); // Remove quotes if present
          this.log(`Part ${i + 1} uploaded`, { etag });
        } else {
          this.log(`Warning: No ETag received for part ${i + 1}`);
          // Fallback: use part number if ETag not available
          uploadedPartIds.push(String(i + 1));
        }
      }

      this.log("All video parts uploaded successfully", {
        partsCount: uploadedPartIds.length,
      });

      // Step 4: Finalize upload with correct uploadedPartIds
      const finalizeResponse = await axios.post(
        `${config.apiUrl}/videos?action=finalizeUpload`,
        {
          finalizeUploadRequest: {
            video: videoUrn,
            uploadToken: uploadToken,
            uploadedPartIds: uploadedPartIds,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "LinkedIn-Version": config.apiVersion,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      this.log("Video finalized", {
        videoUrn,
        response: finalizeResponse.data,
      });

      // Wait for LinkedIn to process the video (5-15 seconds)
      await this.waitForMediaProcessing(videoUrn, 'video');

      return videoUrn;
    } catch (error) {
      this.logError("Video upload failed", error);

      // Enhanced error logging
      if (error.response) {
        this.logError("LinkedIn API Error Details", {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers,
        });
      }

      throw new Error(
        `LinkedIn video upload failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Wait for LinkedIn to process media
  async waitForMediaProcessing(mediaUrn, mediaType = 'image') {
    const waitTime = mediaType === 'video' ? 10000 : 3000; // 10s for video, 3s for image
    
    this.log(`Waiting ${waitTime}ms for LinkedIn to process ${mediaType}...`, { mediaUrn });
    
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    this.log(`${mediaType} processing wait completed`, { mediaUrn });
  }

  async publish(post) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      // Combine content and hashtags
      let fullContent = post.content;
      if (post.hashtags && post.hashtags.length > 0) {
        fullContent += `\n\n${post.hashtags.join(' ')}`;
      }

      // The user requested to remove the [Scheduled: ...] timestamp.
      const uniqueContent = fullContent;

      const payload = {
        author: `urn:li:person:${this.channel.platformUserId}`,
        commentary: uniqueContent,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      };

      // HANDLE MEDIA UPLOADS
      if (post.mediaUrls && post.mediaUrls.length > 0) {
        const hasVideo = post.mediaUrls.some((url) => this.isVideoSource(url));

        if (hasVideo) {
          // Single video upload
          const videoUrn = await this.uploadVideo(post.mediaUrls[0]);
          
          payload.content = {
            media: {
              title: post.title || post.content.substring(0, 100),
              id: videoUrn,
            },
          };

          this.log("Video added to payload", { videoUrn });
        } else if (post.mediaUrls.length === 1) {
          // Single image upload
          const imageUrn = await this.uploadImage(post.mediaUrls[0]);
          
          payload.content = {
            media: {
              title: post.title || post.content.substring(0, 100),
              id: imageUrn,
            },
          };

          this.log("Single image added to payload", { imageUrn });
        } else if (post.mediaUrls.length > 1) {
          // Multiple images upload (carousel)
          const imageUrns = [];
          
          for (const mediaUrl of post.mediaUrls.slice(0, 9)) { // LinkedIn supports max 9 images
            const imageUrn = await this.uploadImage(mediaUrl);
            imageUrns.push({
              id: imageUrn,
              title: post.title || "Image"
            });
            
            this.log(`Image ${imageUrns.length}/${Math.min(post.mediaUrls.length, 9)} uploaded`, { imageUrn });
          }

          payload.content = {
            multiImage: {
              images: imageUrns,
            },
          };

          this.log("Multiple images added to payload", { count: imageUrns.length });
        }
      }

      this.log("Publishing post with payload", {
        hasContent: !!payload.commentary,
        mediaType: payload.content?.media ? 'single' : payload.content?.multiImage ? 'multi' : 'none',
        contentLength: payload.commentary.length,
      });

      const response = await axios.post(`${config.apiUrl}/posts`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": config.apiVersion,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      });

      const postId = response.headers["x-restli-id"];
      const platformPostId = postId.startsWith('urn:li:share:') 
        ? postId 
        : `urn:li:share:${postId}`;

      this.log("Post published", { platformPostId, rawPostId: postId });

      return {
        success: true,
        platformPostId: platformPostId,
        id: platformPostId,
        url: null,
        platformUrl: null,
        provider: "linkedin",
        content: uniqueContent,
        mediaUrls: post.mediaUrls || [],
        mediaType: this.determineMediaType(post),
      };
    } catch (error) {
      this.logError("Publish failed", error);
      
      // BETTER ERROR LOGGING
      if (error.response?.status === 422) {
        this.logError("LinkedIn 422 Error - Possible duplicate content", {
          status: error.response.status,
          data: error.response.data,
          content: post.content.substring(0, 100),
        });
      }
      
      throw new Error(
        `LinkedIn publish failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Helper method to determine media type
  determineMediaType(post) {
    if (!post.mediaUrls || post.mediaUrls.length === 0) {
      return "none";
    }

    const hasVideo = post.mediaUrls.some((url) => this.isVideoSource(url));
    if (hasVideo) return "video";

    if (post.mediaUrls.length > 1) return "multiImage";

    return "image";
  }

  // Helper method to check if source is video
  isVideoSource(mediaSource) {
    if (typeof mediaSource === "string") {
      return /\.(mp4|mov|avi|wmv)$/i.test(mediaSource);
    }
    return false;
  }

  async updatePost(platformPostId, newContent) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const payload = {
        patch: {
          $set: {
            commentary: newContent,
          },
        },
      };

      await axios.post(
        `${config.apiUrl}/posts/${encodeURIComponent(platformPostId)}`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "LinkedIn-Version": config.apiVersion,
            "X-Restli-Protocol-Version": "2.0.0",
            "X-RestLi-Method": "PARTIAL_UPDATE",
          },
        }
      );

      this.log("Post updated", { platformPostId });

      return {
        success: true,
        platformPostId,
      };
    } catch (error) {
      this.logError("Update failed", error);
      throw new Error(
        `LinkedIn update failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  async deletePost(platformPostId) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      await axios.delete(
        `${config.apiUrl}/posts/${encodeURIComponent(platformPostId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "LinkedIn-Version": config.apiVersion,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      this.log("Post deleted", { platformPostId });

      return {
        success: true,
      };
    } catch (error) {
      this.logError("Delete failed", error);
      throw new Error(
        `LinkedIn delete failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  async getPosts(options = {}) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      // Build query parameters in the correct order (q must be first!)
      const queryParams = new URLSearchParams();
      queryParams.append("q", "author");
      queryParams.append(
        "author",
        `urn:li:person:${this.channel.platformUserId}`
      );

      // Add count if specified
      if (options.count) {
        queryParams.append("count", Math.min(options.count, 100).toString());
      }

      // Only add start if it's explicitly provided and greater than 0
      if (options.start && options.start > 0) {
        queryParams.append("start", options.start.toString());
      }

      this.log("Fetching posts with params", Object.fromEntries(queryParams));

      const response = await axios.get(
        `${config.apiUrl}/posts?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "LinkedIn-Version": config.apiVersion,
            "X-Restli-Protocol-Version": "2.0.0",
          },
          timeout: 30000,
        }
      );

      if (!response.data) {
        this.log("Empty response from LinkedIn API");
        return [];
      }

      const posts = response.data.elements || [];
      const paging = response.data.paging || {};

      this.log("Posts retrieved successfully", {
        count: posts.length,
        total: paging.total || "unknown",
      });

      // Format posts
      return posts.map((post) => {
        const id = post.id || "unknown";
        const commentary = post.commentary || "";

        // Extract media info
        let mediaInfo = null;
        if (post.content) {
          if (post.content.media) {
            mediaInfo = {
              type: "single",
              title: post.content.media.title,
              id: post.content.media.id,
            };
          } else if (post.content.multiImage) {
            mediaInfo = {
              type: "multiImage",
              count: post.content.multiImage.images?.length || 0,
              images: post.content.multiImage.images || [],
            };
          } else if (post.content.article) {
            mediaInfo = {
              type: "article",
              title: post.content.article.title,
              source: post.content.article.source,
            };
          }
        }

        return {
          id,
          urn: `urn:li:share:${id}`,
          content: commentary,
          visibility: post.visibility || "UNKNOWN",
          lifecycleState: post.lifecycleState || "UNKNOWN",
          createdAt: post.createdAt
            ? new Date(post.createdAt).toISOString()
            : null,
          lastModifiedAt: post.lastModifiedAt
            ? new Date(post.lastModifiedAt).toISOString()
            : null,
          author: post.author || null,
          distribution: post.distribution || null,
          media: mediaInfo,
          shareUrl: post.shareUrl || null,
        };
      });
    } catch (error) {
      this.logError("Get posts failed", error);

      if (error.response) {
        this.logError("LinkedIn API Error Details", {
          status: error.response.status,
          data: error.response.data,
          url: error.config?.url,
          params: error.config?.params,
        });
      }

      // Specific error handling
      if (error.code === "ECONNABORTED") {
        throw new Error("LinkedIn API request timeout - please try again");
      }

      if (error.response?.status === 401) {
        throw new Error(
          "LinkedIn authentication expired - please reconnect your account"
        );
      }

      if (error.response?.status === 403) {
        throw new Error("LinkedIn access forbidden - check your permissions");
      }

      if (error.response?.status === 429) {
        throw new Error(
          "LinkedIn rate limit exceeded - please wait and try again"
        );
      }

      if (error.response?.status === 400) {
        const errorMsg =
          error.response?.data?.message || "Invalid request parameters";
        throw new Error(`LinkedIn API error: ${errorMsg}`);
      }

      throw new Error(
        `LinkedIn get posts failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  async getPostAnalytics(platformPostId) {
    // LinkedIn analytics require additional API permissions
    // This is a placeholder for future implementation
    this.log("Analytics not yet implemented for LinkedIn", { platformPostId });
    return null;
  }
}

module.exports = LinkedInProvider;
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const FormData = require("form-data");
const BaseProvider = require("../providers/baseProvider");

class FacebookProvider extends BaseProvider {
  getConfig() {
    return {
      appId: process.env.FACEBOOK_APP_ID,
      appSecret: process.env.FACEBOOK_APP_SECRET,
      callbackUrl: process.env.FACEBOOK_CALLBACK_URL,
      authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
      apiUrl: "https://graph.facebook.com/v18.0",
      scopes: [
        "pages_manage_posts",
        "pages_read_engagement",
        "pages_show_list",
        "business_management"
      ],
    };
  }

  getAuthorizationUrl(state) {
    const config = this.getConfig();
    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.callbackUrl,
      state: state,
      scope: config.scopes.join(","),
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  async handleCallback(code) {
    const config = this.getConfig();

    try {
      const tokenResponse = await axios.get(config.tokenUrl, {
        params: {
          client_id: config.appId,
          client_secret: config.appSecret,
          redirect_uri: config.callbackUrl,
          code: code,
        },
      });

      const { access_token } = tokenResponse.data;

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

      const pagesResponse = await axios.get(`${config.apiUrl}/me/accounts`, {
        params: {
          access_token: longLivedToken,
        },
      });

      const pages = pagesResponse.data.data;

      if (!pages || pages.length === 0) {
        throw new Error("No Facebook Pages found. Please create a Page first.");
      }

      const page = pages[0];

      return {
        accessToken: page.access_token,
        refreshToken: null,
        expiresIn: null,
        platformUserId: page.id,
        platformUsername: page.username || page.id,
        displayName: page.name,
        profileUrl: `https://facebook.com/${page.id}`,
        avatar: `https://graph.facebook.com/${page.id}/picture?type=large`,
        providerData: {
          category: page.category,
          tasks: page.tasks,
        },
      };
    } catch (error) {
      this.logError("OAuth callback", error);
      throw new Error(
        `Facebook OAuth failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  async refreshAccessToken() {
    throw new Error("Facebook Page tokens do not need refresh");
  }

  async testConnection() {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.get(
        `${config.apiUrl}/${this.channel.platformUserId}`,
        {
          params: {
            fields: "id,name",
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

  async getMediaBuffer(mediaSource) {
    if (typeof mediaSource === "string" && /^https?:\/\//i.test(mediaSource)) {
      this.log("Downloading from URL", { url: mediaSource });
      const response = await axios.get(mediaSource, {
        responseType: "arraybuffer",
        timeout: 60000,
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
    };
    return mimeTypes[ext] || "application/octet-stream";
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

      if (!post.mediaUrls || post.mediaUrls.length === 0) {
        this.log("Publishing text-only post");
        const response = await axios.post(
          `${config.apiUrl}/${this.channel.platformUserId}/feed`,
          {
            message: fullContent,
            access_token: accessToken,
          }
        );

        return {
          success: true,
          platformPostId: response.data.id,
          platformUrl: `https://facebook.com/${response.data.id}`,
          mediaType: "none",
        };
      }

      const hasVideo = post.mediaUrls.some((url) =>
        /\.(mp4|mov|avi)$/i.test(url)
      );

      if (hasVideo && post.mediaUrls.length === 1) {
        return await this.publishVideo(
          fullContent,
          post.mediaUrls[0],
          accessToken,
          config
        );
      }

      if (post.mediaUrls.length === 1) {
        return await this.publishPhoto(
          fullContent,
          post.mediaUrls[0],
          accessToken,
          config
        );
      }

      this.log(`Publishing ${post.mediaUrls.length} images`);
      return await this.publishMultiplePhotos(
        fullContent,
        post.mediaUrls,
        accessToken,
        config
      );
    } catch (error) {
      this.logError("Publish failed", error);
      throw new Error(
        `Facebook publish failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  async publishMultiplePhotos(message, photoSources, accessToken, config) {
    try {
      this.log("Creating photo album", { count: photoSources.length });

      const uploadedPhotoIds = [];

      for (let i = 0; i < photoSources.length; i++) {
        const photoSource = photoSources[i];
        this.log(`Uploading photo ${i + 1}/${photoSources.length}`);

        let photoId;

        if (photoSource.startsWith("http")) {
          const response = await axios.post(
            `${config.apiUrl}/${this.channel.platformUserId}/photos`,
            {
              url: photoSource,
              published: false,
              access_token: accessToken,
            }
          );
          photoId = response.data.id;
        } else {
          const { buffer, contentType } = await this.getMediaBuffer(
            photoSource
          );
          const formData = new FormData();
          formData.append("published", "false");
          formData.append("access_token", accessToken);
          formData.append("source", buffer, {
            filename: `photo-${i}.jpg`,
            contentType: contentType,
          });

          const response = await axios.post(
            `${config.apiUrl}/${this.channel.platformUserId}/photos`,
            formData,
            {
              headers: {
                ...formData.getHeaders(),
              },
            }
          );
          photoId = response.data.id;
        }

        uploadedPhotoIds.push({ media_fbid: photoId });
        this.log(`Photo ${i + 1} uploaded`, { photoId });
      }

      const response = await axios.post(
        `${config.apiUrl}/${this.channel.platformUserId}/feed`,
        {
          message: message,
          attached_media: uploadedPhotoIds,
          access_token: accessToken,
        }
      );

      this.log("Multiple photos published successfully", {
        postId: response.data.id,
        photoCount: uploadedPhotoIds.length,
      });

      return {
        success: true,
        platformPostId: response.data.id,
        platformUrl: `https://facebook.com/${response.data.id}`,
        mediaType: "multiImage",
      };
    } catch (error) {
      this.logError("Multiple photos publish failed", error);
      throw error;
    }
  }

  async publishPhoto(message, photoSource, accessToken, config) {
    try {
      let photoUrl = photoSource;

      if (!photoSource.startsWith("http")) {
        const { buffer, contentType } = await this.getMediaBuffer(photoSource);

        const formData = new FormData();
        formData.append("message", message);
        formData.append("access_token", accessToken);
        formData.append("source", buffer, {
          filename: "photo.jpg",
          contentType: contentType,
        });

        const response = await axios.post(
          `${config.apiUrl}/${this.channel.platformUserId}/photos`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
            },
          }
        );

        this.log("Photo uploaded successfully", {
          postId: response.data.post_id,
        });

        return {
          success: true,
          platformPostId: response.data.post_id,
          platformUrl: `https://facebook.com/${response.data.post_id}`,
          mediaType: "image",
        };
      }

      const response = await axios.post(
        `${config.apiUrl}/${this.channel.platformUserId}/photos`,
        {
          message: message,
          url: photoUrl,
          access_token: accessToken,
        }
      );

      this.log("Photo published successfully", {
        postId: response.data.post_id,
      });

      return {
        success: true,
        platformPostId: response.data.post_id,
        platformUrl: `https://facebook.com/${response.data.post_id}`,
        mediaType: "image",
      };
    } catch (error) {
      this.logError("Photo publish failed", error);
      throw error;
    }
  }

  async publishVideo(description, videoSource, accessToken, config) {
    try {
      const { buffer, contentType } = await this.getMediaBuffer(videoSource);

      this.log('Uploading video', { 
        size: buffer.length, 
        sizeMB: (buffer.length / 1024 / 1024).toFixed(2) 
      });

      const formData = new FormData();
      formData.append('description', description);
      formData.append('access_token', accessToken);
      formData.append('source', buffer, {
        filename: 'video.mp4',
        contentType: contentType,
      });

      const response = await axios.post(
        `${config.apiUrl}/${this.channel.platformUserId}/videos`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 120000,
        }
      );

      const videoId = response.data.id;

      this.log('Video uploaded successfully', { 
        videoId,
        pageId: this.channel.platformUserId 
      });

      return {
        success: true,
        platformPostId: videoId,
        platformUrl: `https://facebook.com/${this.channel.platformUserId}/videos/${videoId}`,
        mediaType: 'video',
      };
    } catch (error) {
      this.logError('Video publish failed', error);
      
      if (error.response) {
        this.logError('Facebook API Error Details', {
          status: error.response.status,
          data: error.response.data,
        });
      }

      throw new Error(
        `Facebook video upload failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  /**
   * Update post with fallback logic for videos
   */
  async updatePost(platformPostId, newContent) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      this.log('Attempting to update post', { platformPostId });

      // Try updating with 'message' field first (works for text/photo posts)
      try {
        const response = await axios.post(
          `${config.apiUrl}/${platformPostId}`,
          {
            message: newContent,
            access_token: accessToken,
          }
        );

        this.log('Post updated successfully', { platformPostId });

        return {
          success: true,
          platformPostId: platformPostId,
          message: 'Post content updated successfully',
        };
        
      } catch (messageError) {
        // If 'message' field fails, try 'description' field (for videos)
        this.log('Message field failed, trying description field for video', { 
          platformPostId,
          error: messageError.response?.data?.error?.message 
        });

        const response = await axios.post(
          `${config.apiUrl}/${platformPostId}`,
          {
            description: newContent,
            access_token: accessToken,
          }
        );

        this.log('Video description updated successfully', { platformPostId });

        return {
          success: true,
          platformPostId: platformPostId,
          message: 'Video description updated (video file cannot be changed)',
        };
      }

    } catch (error) {
      this.logError('Update failed', error);
      
      // Enhanced error message
      if (error.response?.data?.error?.code === 100) {
        throw new Error(
          `This post cannot be edited. Facebook has restrictions on editing certain post types.`
        );
      }

      throw new Error(
        `Facebook update failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  async deletePost(platformPostId) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.delete(
        `${config.apiUrl}/${platformPostId}`,
        {
          params: {
            access_token: accessToken,
          },
        }
      );

      this.log("Post deleted successfully", { postId: platformPostId });

      return {
        success: true,
        message: "Post deleted successfully from Facebook",
      };
    } catch (error) {
      this.logError("Delete failed", error);
      throw new Error(
        `Facebook delete failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  async getPosts(options = {}) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();
      const limit = options.limit || 25;

      const response = await axios.get(
        `${config.apiUrl}/${this.channel.platformUserId}/feed`,
        {
          params: {
            fields: "id,message,created_time,permalink_url,full_picture",
            limit: limit,
            access_token: accessToken,
          },
        }
      );

      const posts = response.data.data || [];

      this.log("Posts retrieved successfully", { count: posts.length });

      return posts.map((post) => ({
        platformPostId: post.id,
        content: post.message || "",
        platformUrl: post.permalink_url,
        publishedAt: new Date(post.created_time),
        mediaUrl: post.full_picture || null,
      }));
    } catch (error) {
      this.logError("Get posts failed", error);
      throw new Error(
        `Facebook get posts failed: ${
          error.response?.data?.error?.message || error.message
        }`
      );
    }
  }

  async getPostAnalytics(platformPostId) {
    try {
      const accessToken = this.getAccessToken();
      const config = this.getConfig();

      const response = await axios.get(`${config.apiUrl}/${platformPostId}`, {
        params: {
          fields: "likes.summary(true),comments.summary(true),shares",
          access_token: accessToken,
        },
      });

      const data = response.data;

      return {
        likes: data.likes?.summary?.total_count || 0,
        comments: data.comments?.summary?.total_count || 0,
        shares: data.shares?.count || 0,
        reach: null,
        impressions: null,
      };
    } catch (error) {
      this.logError("Get analytics failed", error);
      return null;
    }
  }
}

module.exports = FacebookProvider;
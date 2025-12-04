#!/bin/bash

# Azure Web App Configuration Script
# Run this to add missing environment variables and configure the app

APP_NAME="socialflow-jii2if-api"
RG_NAME="socialflow-jii2if-rg"

echo "🔧 Configuring Azure Web App: $APP_NAME"
echo "========================================"

# Add all missing environment variables
echo "📝 Adding environment variables..."
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RG_NAME \
  --settings \
    MONGODB_DB_NAME="social_media_platform" \
    REDIS_DB_CACHE="0" \
    REDIS_DB_SESSION="1" \
    REDIS_DB_QUEUE="2" \
    JWT_EXPIRES_IN="3d" \
    JWT_REFRESH_EXPIRES_IN="3d" \
    AWS_S3_MEDIA_FOLDER="media" \
    AWS_S3_AVATARS_FOLDER="avatars" \
    AWS_S3_THUMBNAILS_FOLDER="thumbnails" \
    LINKEDIN_ENABLED="true" \
    LINKEDIN_USE_REAL_API="true" \
    FACEBOOK_ENABLED="true" \
    FACEBOOK_USE_REAL_API="true" \
    INSTAGRAM_ENABLED="true" \
    INSTAGRAM_USE_REAL_API="true" \
    INSTAGRAM_API_VERSION="v21.0" \
    INSTAGRAM_SCOPES="instagram_basic,instagram_content_publish,pages_read_engagement,pages_show_list" \
    TWITTER_API_VERSION="2" \
    TWITTER_ENABLED="true" \
    TWITTER_USE_REAL_API="true" \
    TWITTER_SCOPES="tweet.read,tweet.write,users.read,offline.access" \
    TWITTER_FREE_TIER_POST_LIMIT="17" \
    TWITTER_FREE_TIER_WINDOW="86400000" \
    YOUTUBE_DEFAULT_CATEGORY="22" \
    YOUTUBE_DEFAULT_PRIVACY="public" \
    YOUTUBE_MAX_FILE_SIZE_MB="2048" \
    YOUTUBE_SCOPES="https://www.googleapis.com/auth/youtube.upload,https://www.googleapis.com/auth/youtube,https://www.googleapis.com/auth/youtube.readonly" \
    SOCIAL_PROVIDER_MODE="mixed" \
    ENABLE_SOCIAL_POSTING="true" \
    ENABLE_ANALYTICS_COLLECTION="true" \
    ENABLE_EMAIL_NOTIFICATIONS="true" \
    ENABLE_QUEUE_PROCESSING="true" \
    ENABLE_ANALYTICS_SYNC="true" \
    ENABLE_TOKEN_REFRESH="true" \
    RATE_LIMIT_WINDOW_MS="60000" \
    RATE_LIMIT_MAX_REQUESTS="100" \
    RATE_LIMIT_ENABLED="true" \
    LOG_LEVEL="info" \
    ENCRYPTION_ALGORITHM="aes-256-gcm" \
    CORS_CREDENTIALS="true" \
    SESSION_LIFETIME="7200000" \
    SESSION_SECURE="true" \
    UPLOAD_DIR="uploads" \
    MAX_FILE_SIZE="10485760" \
    ALLOWED_IMAGE_TYPES="image/jpeg,image/png,image/gif,image/webp" \
    ALLOWED_VIDEO_TYPES="video/mp4,video/mpeg,video/quicktime" \
    MAIL_FROM_NAME="Social Media Marketing Platform" \
    CLOUDINARY_FOLDER="social-media-videos"

echo "✅ Environment variables added"

# Configure health check
echo "🏥 Configuring health check..."
az webapp config set \
  --name $APP_NAME \
  --resource-group $RG_NAME \
  --health-check-path "/health"

echo "✅ Health check configured"

# Enable detailed logging
echo "📊 Enabling application logging..."
az webapp log config \
  --name $APP_NAME \
  --resource-group $RG_NAME \
  --application-logging filesystem \
  --level information \
  --web-server-logging filesystem

echo "✅ Logging enabled"

# Increase startup timeout
echo "⏱️  Increasing startup timeout..."
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RG_NAME \
  --settings \
    WEBSITES_CONTAINER_START_TIME_LIMIT="1800"

echo "✅ Startup timeout increased to 30 minutes"

# Configure firewall for Cosmos DB (allow Azure services)
echo "🔥 Configuring Cosmos DB firewall..."
az cosmosdb update \
  --name socialflow-jii2if-db \
  --resource-group $RG_NAME \
  --enable-public-network true \
  --ip-range-filter "0.0.0.0"

echo "✅ Cosmos DB firewall configured"

# Restart the app
echo "🔄 Restarting application..."
az webapp restart \
  --name $APP_NAME \
  --resource-group $RG_NAME

echo "✅ Application restarted"

echo ""
echo "========================================"
echo "✅ Configuration complete!"
echo "========================================"
echo ""
echo "📋 Next steps:"
echo "  1. Wait 2-3 minutes for the app to start"
echo "  2. Check health: https://$APP_NAME.azurewebsites.net/health"
echo "  3. View logs: az webapp log tail --name $APP_NAME --resource-group $RG_NAME"
echo ""
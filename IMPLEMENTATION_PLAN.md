# 🚀 EXPRESS.JS IMPLEMENTATION PLAN
## Social Media Marketing Platform - Node.js Migration

**Created:** October 6, 2025  
**Duration:** 20 Days (Oct 7 - Oct 26, 2025)  
**Previous Framework:** Laravel (Abandoned due to CSRF/API compatibility issues)  
**Current Framework:** Express.js + MongoDB + Redis

---

## 📊 MIGRATION ADVANTAGES

### Why Express.js is Better for This Project:

✅ **API-First Architecture**
- No CSRF token complications for external OAuth callbacks
- Native JSON handling without middleware battles
- RESTful API design is Express's core strength

✅ **OAuth Integration**
- Simpler OAuth flow implementation
- No framework-imposed security that blocks social media callbacks
- Better control over authentication middleware

✅ **Real-time Capabilities**
- Native async/await support
- Better queue management with Bull
- WebSocket integration for real-time notifications

✅ **MongoDB Native Integration**
- Mongoose ORM is designed for Node.js
- Better query performance
- Flexible schema changes without migrations

✅ **Ecosystem**
- Passport.js for OAuth (battle-tested)
- Bull for queue management
- Sharp for image processing
- Nodemailer for emails

---

## 🎯 PROJECT STATUS

### ✅ COMPLETED (Phase 0)
- [x] Project initialization with Express.js
- [x] Package.json with all dependencies
- [x] Environment variable validation (Joi schema)
- [x] MongoDB connection with retry logic
- [x] Redis multi-database setup (Cache, Session, Queue)
- [x] Winston logger with file rotation
- [x] Docker Compose for Redis
- [x] ESLint configuration
- [x] Jest testing setup
- [x] Basic Express app structure
- [x] Health check endpoint
- [x] Error handling middleware

### 📁 Current File Structure
```
server/
├── src/
│   ├── config/
│   │   ├── database.js     ✅ MongoDB connection
│   │   ├── env.js          ✅ Environment validation
│   │   └── redis.js        ✅ Redis multi-client
│   ├── utils/
│   │   └── logger.js       ✅ Winston logger
│   ├── app.js              ✅ Express app
│   └── server.js           ✅ Server entry point
├── logs/                   ✅ Log files
├── .env                    ✅ Environment config
├── docker-compose.yml      ✅ Redis setup
├── package.json            ✅ Dependencies
└── jest.config.js          ✅ Test config
```

---

## 📅 IMPLEMENTATION TIMELINE (20 DAYS)

### **WEEK 1: FOUNDATION (Days 1-5)**

#### **Day 1-2: Authentication System**
- User model with password hashing
- JWT utilities (access + refresh tokens)
- Registration & login endpoints
- Auth middleware
- Password reset flow
- **Deliverable:** Working authentication with Postman tests

#### **Day 3: Organization & Brand Models**
- Organization schema
- Brand schema with soft delete
- Membership model (RBAC)
- Brand CRUD endpoints
- **Deliverable:** Multi-tenant brand management

#### **Day 4-5: OAuth Infrastructure**
- Base Provider abstract class
- OAuth state management (Redis)
- Token encryption utilities
- Channel model with encrypted storage
- Facebook OAuth integration
- **Deliverable:** First working OAuth connection

---

### **WEEK 2: SOCIAL MEDIA INTEGRATIONS (Days 6-10)**

#### **Day 6: LinkedIn Integration**
- LinkedInProvider implementation
- OAuth 2.0 flow with authorization code
- Token refresh logic
- Connection test endpoint
- **Deliverable:** LinkedIn account connection working

#### **Day 7: Instagram Integration**
- InstagramProvider (via Facebook Graph API)
- Instagram Business Account connection
- Media publishing constraints
- **Deliverable:** Instagram connection working

#### **Day 8: Twitter/X Integration**
- TwitterProvider with OAuth 2.0 PKCE
- Tweet publishing logic
- Character limit validation
- **Deliverable:** Twitter connection working

#### **Day 9: YouTube Integration**
- YouTubeProvider implementation
- Video upload handling
- Quota management
- **Deliverable:** YouTube connection working

#### **Day 10: Channel Management**
- Channel listing endpoint
- Connection health checks
- Token refresh cron job
- Disconnect functionality
- **Deliverable:** Full channel management system

---

### **WEEK 3: CONTENT & PUBLISHING (Days 11-15)**

#### **Day 11: Post Model & Validation**
- Post schema with embedded schedules
- Platform-specific validation rules
- Character count utilities
- Draft/Published status workflow
- **Deliverable:** Post CRUD endpoints

#### **Day 12: Media Management**
- Multer file upload middleware
- Sharp image processing
- S3/local storage service
- Media library endpoints
- **Deliverable:** Image/video upload working

#### **Day 13: Scheduling System**
- Calendar view endpoint
- Schedule validation logic
- Timezone handling
- Bulk scheduling support
- **Deliverable:** Post scheduling working

#### **Day 14: Publishing Engine**
- Bull queue setup for publishing
- Post publishing job processor
- Provider-specific publishing logic
- Retry mechanism with exponential backoff
- **Deliverable:** Automated post publishing

#### **Day 15: Publishing Status & Notifications**
- Real-time status updates
- Email notifications (Nodemailer)
- Publishing error handling
- Dead letter queue
- **Deliverable:** Complete publishing workflow

---

### **WEEK 4: ANALYTICS & POLISH (Days 16-20)**

#### **Day 16: Analytics Collection**
- Analytics model (time-series data)
- Facebook Insights integration
- Instagram Insights integration
- Twitter analytics
- **Deliverable:** Analytics data collection

#### **Day 17: Analytics Dashboard**
- Dashboard summary endpoint
- Performance metrics aggregation
- Platform comparison logic
- Date range filtering
- **Deliverable:** Analytics API endpoints

#### **Day 18: Reporting & Export**
- Report generation service
- CSV export functionality
- Chart data formatting
- Top posts analysis
- **Deliverable:** Complete analytics system

#### **Day 19: Team Collaboration**
- Team member invitation
- Role-based permissions middleware
- Activity logging
- Notification preferences
- **Deliverable:** Full RBAC system

#### **Day 20: Testing & Documentation**
- Complete Postman collection
- API documentation (Swagger/Postman)
- Integration tests
- Performance optimization
- **Deliverable:** Production-ready API

---

## 📋 DETAILED PHASE BREAKDOWN

### **PHASE 1: AUTHENTICATION & USER MANAGEMENT (Days 1-2)**

#### Files to Create:
```
src/
├── models/
│   └── User.js
├── controllers/
│   └── authController.js
├── services/
│   ├── authService.js
│   └── emailService.js
├── middleware/
│   ├── auth.js
│   └── validate.js
├── routes/
│   └── auth.js
└── utils/
    ├── jwt.js
    └── validators.js
```

#### Implementation Steps:

**1.1 User Model (`models/User.js`)**
```javascript
- Email validation (unique)
- Password hashing (bcryptjs)
- Profile fields (name, avatar, timezone)
- Google OAuth fields (googleId, googleEmail)
- Account status (active, suspended)
- Password reset tokens
- Methods: comparePassword(), generateAuthToken()
```

**1.2 JWT Utilities (`utils/jwt.js`)**
```javascript
- generateAccessToken() - 2 hour expiration
- generateRefreshToken() - 7 day expiration
- verifyToken()
- blacklistToken() - Store in Redis
- isTokenBlacklisted()
```

**1.3 Auth Service (`services/authService.js`)**
```javascript
- register(email, password, name)
- login(email, password)
- logout(token)
- refreshToken(refreshToken)
- requestPasswordReset(email)
- resetPassword(token, newPassword)
- updateProfile(userId, data)
- uploadAvatar(userId, file)
```

**1.4 Auth Controller (`controllers/authController.js`)**
```javascript
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh-token
GET    /api/v1/auth/me
PATCH  /api/v1/auth/profile
POST   /api/v1/auth/upload-avatar
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
```

**1.5 Auth Middleware (`middleware/auth.js`)**
```javascript
- requireAuth - Validates JWT token
- optionalAuth - Attaches user if token present
- refreshTokenMiddleware - Handles token refresh
```

**1.6 Validation (`middleware/validate.js`)**
```javascript
- validateRegistration
- validateLogin
- validateProfileUpdate
- validatePasswordReset
```

#### Postman Tests:
- ✅ Register new user → Returns JWT token
- ✅ Login with credentials → Returns access + refresh tokens
- ✅ Access protected route with token → Returns user data
- ✅ Logout → Blacklists token
- ✅ Refresh token → Returns new access token
- ✅ Update profile → Updates user data
- ✅ Upload avatar → Stores image and updates user
- ✅ Invalid token → Returns 401 error

---

### **PHASE 2: ORGANIZATION & BRAND MANAGEMENT (Day 3)**

#### Files to Create:
```
src/
├── models/
│   ├── Organization.js
│   ├── Brand.js
│   └── Membership.js
├── controllers/
│   ├── organizationController.js
│   └── brandController.js
├── services/
│   ├── organizationService.js
│   └── brandService.js
├── middleware/
│   └── rbac.js
└── routes/
    ├── organizations.js
    └── brands.js
```

#### Implementation Steps:

**2.1 Organization Model**
```javascript
- name (unique)
- slug (auto-generated)
- owner (User reference)
- settings (timezone, features)
- subscription (tier, status)
- Methods: addMember(), removeMember()
```

**2.2 Brand Model**
```javascript
- name
- organization (reference)
- description
- logo URL
- settings (posting defaults, approval required)
- status (active, archived)
- deletedAt (soft delete)
```

**2.3 Membership Model**
```javascript
- user (reference)
- brand (reference)
- organization (reference)
- role (Owner, Manager, Editor, Viewer)
- permissions (array)
- invitedBy (User reference)
- acceptedAt (timestamp)
```

**2.4 Brand Endpoints**
```javascript
GET    /api/v1/brands
POST   /api/v1/brands
GET    /api/v1/brands/:id
PATCH  /api/v1/brands/:id
DELETE /api/v1/brands/:id (soft delete)
POST   /api/v1/brands/:id/members
GET    /api/v1/brands/:id/members
PATCH  /api/v1/brands/:id/members/:userId
DELETE /api/v1/brands/:id/members/:userId
```

**2.5 RBAC Middleware**
```javascript
- requireRole(['Owner', 'Manager'])
- requirePermission('publish_posts')
- checkBrandAccess(brandId)
```

#### Postman Tests:
- ✅ Create brand → Returns brand object
- ✅ List user's brands → Returns accessible brands
- ✅ Invite team member → Sends email + creates membership
- ✅ Update member role → Changes permissions
- ✅ Editor tries to delete brand → Returns 403 Forbidden
- ✅ Remove team member → Revokes access

---

### **PHASE 3: CHANNEL MANAGEMENT & OAUTH (Days 4-10)**

#### Files to Create:
```
src/
├── models/
│   └── Channel.js
├── providers/
│   ├── BaseProvider.js
│   ├── FacebookProvider.js
│   ├── LinkedInProvider.js
│   ├── TwitterProvider.js
│   ├── InstagramProvider.js
│   └── YouTubeProvider.js
├── controllers/
│   └── channelController.js
├── services/
│   ├── channelService.js
│   ├── oauthService.js
│   └── encryptionService.js
├── middleware/
│   └── oauth.js
└── routes/
    └── channels.js
```

#### Implementation Steps:

**3.1 Channel Model**
```javascript
- brand (reference)
- provider (facebook, linkedin, twitter, etc.)
- platformUserId
- platformUsername
- displayName
- avatar
- accessToken (encrypted)
- refreshToken (encrypted)
- tokenExpiresAt
- scopes (array)
- connectionStatus (active, expired, error)
- lastHealthCheck
- providerData (JSON - platform-specific)
```

**3.2 Encryption Service**
```javascript
- encrypt(text) - AES-256-GCM encryption
- decrypt(encrypted) - Decryption
- Uses ENCRYPTION_KEY from .env
```

**3.3 Base Provider (`providers/BaseProvider.js`)**
```javascript
abstract class BaseProvider {
  constructor(channel)
  
  // OAuth methods
  getAuthorizationUrl(state)
  handleCallback(code, state)
  refreshAccessToken()
  
  // Publishing methods
  validatePost(post)
  publish(post)
  schedulePost(post, date)
  
  // Analytics methods
  getPostAnalytics(postId)
  getAccountAnalytics(dateRange)
  
  // Utilities
  testConnection()
  revokeAccess()
}
```

**3.4 Facebook Provider**
```javascript
- OAuth 2.0 with long-lived tokens
- Permissions: pages_manage_posts, pages_read_engagement
- API: Graph API v18.0
- Character limit: 63,206
- Media: Up to 10 images/videos
```

**3.5 LinkedIn Provider**
```javascript
- OAuth 2.0 authorization code flow
- Permissions: w_member_social, r_organization_social
- API: Marketing API v2
- Character limit: 3,000
- Media: Up to 20 attachments
```

**3.6 Twitter Provider**
```javascript
- OAuth 2.0 with PKCE
- Permissions: tweet.write, users.read, offline.access
- API: Twitter API v2
- Character limit: 280
- Media: Up to 4 images
```

**3.7 Instagram Provider**
```javascript
- OAuth via Facebook Graph API
- Business account required
- Permissions: instagram_basic, instagram_content_publish
- Character limit: 2,200
- Media: 1 image or video
```

**3.8 YouTube Provider**
```javascript
- OAuth 2.0 with Google
- Permissions: youtube.upload, youtube.readonly
- API: YouTube Data API v3
- Video limit: 256GB
- Quota: 10,000 units/day
```

**3.9 Channel Endpoints**
```javascript
// OAuth Flow
GET    /api/v1/channels/oauth/:provider (Redirect to provider)
GET    /api/v1/channels/oauth/:provider/callback (Handle callback)

// Channel Management
GET    /api/v1/channels
GET    /api/v1/channels/:id
GET    /api/v1/channels/:id/test (Test connection)
DELETE /api/v1/channels/:id (Disconnect)
POST   /api/v1/channels/:id/refresh (Refresh token)
```

**3.10 OAuth State Management**
```javascript
- Generate random state parameter
- Store in Redis with 10-minute expiration
- Include: brandId, userId, provider, redirectUrl
- Validate on callback
```

#### Postman Tests:
- ✅ Get Facebook auth URL → Returns OAuth URL with state
- ✅ Facebook callback with code → Stores encrypted tokens
- ✅ List channels → Returns all connected accounts
- ✅ Test channel connection → Validates token
- ✅ Refresh token → Updates access token
- ✅ Disconnect channel → Deletes channel record

---

### **PHASE 4: POST MANAGEMENT (Days 11-13)**

#### Files to Create:
```
src/
├── models/
│   ├── Post.js
│   └── Media.js
├── controllers/
│   ├── postController.js
│   ├── mediaController.js
│   └── calendarController.js
├── services/
│   ├── postService.js
│   ├── mediaService.js
│   ├── schedulingService.js
│   └── validationService.js
├── middleware/
│   └── upload.js
└── routes/
    ├── posts.js
    ├── media.js
    └── calendar.js
```

#### Implementation Steps:

**4.1 Post Model**
```javascript
{
  brand: ObjectId,
  createdBy: ObjectId,
  title: String,
  content: String,
  media: [MediaReference],
  
  // Embedded schedules for each platform
  schedules: [{
    channel: ObjectId,
    provider: String,
    scheduledFor: Date,
    status: 'pending|published|failed|cancelled',
    publishedAt: Date,
    platformPostId: String,
    error: String
  }],
  
  // Validation results
  validationResults: [{
    provider: String,
    isValid: Boolean,
    errors: [String],
    warnings: [String]
  }],
  
  // Post settings
  settings: {
    requireApproval: Boolean,
    approvedBy: ObjectId,
    approvedAt: Date
  },
  
  status: 'draft|scheduled|published|failed',
  publishedCount: Number,
  failedCount: Number
}
```

**4.2 Media Model**
```javascript
{
  brand: ObjectId,
  uploadedBy: ObjectId,
  filename: String,
  originalName: String,
  mimeType: String,
  size: Number,
  url: String,
  thumbnailUrl: String,
  altText: String,
  caption: String,
  dimensions: { width, height },
  duration: Number (for videos),
  folder: String,
  tags: [String]
}
```

**4.3 Post Validation Service**
```javascript
class ValidationService {
  validateForProvider(post, provider) {
    // Check character limits
    // Validate media constraints
    // Check required fields
    // Return { isValid, errors, warnings }
  }
  
  validateAllProviders(post, channels) {
    // Run validation for each channel
    // Return validation results map
  }
}
```

**4.4 Media Upload Service**
```javascript
- Multer configuration (10MB images, 100MB videos)
- Sharp image processing (resize, compress)
- Thumbnail generation
- S3 upload or local storage
- Supported formats: JPG, PNG, GIF, MP4, MOV
```

**4.5 Post Endpoints**
```javascript
POST   /api/v1/posts
GET    /api/v1/posts
GET    /api/v1/posts/:id
PATCH  /api/v1/posts/:id
DELETE /api/v1/posts/:id

POST   /api/v1/posts/:id/schedule
PATCH  /api/v1/posts/:id/schedule/:scheduleId
DELETE /api/v1/posts/:id/schedule/:scheduleId

POST   /api/v1/posts/:id/approve
POST   /api/v1/posts/:id/publish (immediate)

GET    /api/v1/calendar (calendar view)
```

**4.6 Media Endpoints**
```javascript
POST   /api/v1/media/upload
GET    /api/v1/media
GET    /api/v1/media/:id
PATCH  /api/v1/media/:id (update alt text, caption)
DELETE /api/v1/media/:id
```

#### Postman Tests:
- ✅ Upload image → Returns media object with URL
- ✅ Create post with media → Saves draft
- ✅ Validate post for platforms → Returns validation results
- ✅ Schedule post → Creates schedule records
- ✅ Update schedule time → Modifies schedule
- ✅ Cancel schedule → Changes status to cancelled
- ✅ Get calendar view → Returns organized posts by date

---

### **PHASE 5: PUBLISHING ENGINE (Days 14-15)**

#### Files to Create:
```
src/
├── jobs/
│   ├── publishPostJob.js
│   ├── retryFailedPostJob.js
│   └── syncAnalyticsJob.js
├── queues/
│   └── queueManager.js
├── services/
│   └── publishingService.js
└── workers/
    └── publishWorker.js
```

#### Implementation Steps:

**5.1 Queue Manager (`queues/queueManager.js`)**
```javascript
const Bull = require('bull');

class QueueManager {
  constructor() {
    this.publishQueue = new Bull('publish-posts', {
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        db: process.env.REDIS_DB_QUEUE
      }
    });
  }
  
  addPublishJob(postId, scheduleId, scheduledFor) {
    return this.publishQueue.add({
      postId,
      scheduleId
    }, {
      delay: scheduledFor - Date.now(),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000 // 1 minute
      }
    });
  }
}
```

**5.2 Publish Post Job**
```javascript
publishQueue.process(async (job) => {
  const { postId, scheduleId } = job.data;
  
  // 1. Load post and schedule
  // 2. Get channel and provider
  // 3. Call provider.publish()
  // 4. Update schedule status
  // 5. Send notification
  // 6. Handle errors
});
```

**5.3 Publishing Service**
```javascript
class PublishingService {
  async publishNow(postId, channelIds) {
    // Create schedules with current time
    // Queue publish jobs immediately
  }
  
  async publishScheduled(postId, channelIds, dateTime) {
    // Create schedules with future time
    // Queue jobs with delay
  }
  
  async cancelScheduled(scheduleId) {
    // Remove from queue
    // Update schedule status
  }
  
  async retryFailed(scheduleId) {
    // Re-queue failed publish
  }
}
```

**5.4 Notification Service**
```javascript
- sendPublishSuccessEmail()
- sendPublishFailureEmail()
- sendDailySummaryEmail()
- createInAppNotification()
```

**5.5 Error Handling**
```javascript
- Rate limit errors → Exponential backoff
- Authentication errors → Notify to reconnect
- Validation errors → Mark as failed
- Network errors → Retry with backoff
- Dead letter queue for 3+ failures
```

#### Postman Tests:
- ✅ Publish immediately → Queues job and publishes
- ✅ Schedule for future → Creates delayed job
- ✅ Cancel scheduled → Removes from queue
- ✅ Retry failed post → Re-queues job
- ✅ Simulate rate limit → Retries with backoff
- ✅ Invalid token → Marks as failed + notifies user

---

### **PHASE 6: ANALYTICS (Days 16-18)**

#### Files to Create:
```
src/
├── models/
│   └── Analytics.js
├── controllers/
│   ├── analyticsController.js
│   └── reportController.js
├── services/
│   ├── analyticsService.js
│   └── reportService.js
├── jobs/
│   └── syncAnalyticsJob.js
└── routes/
    └── analytics.js
```

#### Implementation Steps:

**6.1 Analytics Model**
```javascript
{
  post: ObjectId,
  channel: ObjectId,
  brand: ObjectId,
  provider: String,
  
  metrics: {
    impressions: Number,
    reach: Number,
    likes: Number,
    comments: Number,
    shares: Number,
    clicks: Number,
    saves: Number,
    engagementRate: Number
  },
  
  demographics: {
    age: Object,
    gender: Object,
    location: Object
  },
  
  recordedAt: Date,
  asOf: Date (when data was fetched)
}
```

**6.2 Analytics Sync Job**
```javascript
// Cron job: Daily at 2 AM
analyticsQueue.add('sync-daily', {}, {
  repeat: { cron: '0 2 * * *' }
});

// Processor
analyticsQueue.process('sync-daily', async (job) => {
  // 1. Get all published posts from last 30 days
  // 2. For each channel, call provider.getPostAnalytics()
  // 3. Store analytics data
  // 4. Calculate trends
});
```

**6.3 Analytics Service**
```javascript
class AnalyticsService {
  async syncPostAnalytics(postId) {
    // Sync analytics for specific post
  }
  
  async getDashboardMetrics(brandId, dateRange) {
    // Aggregate metrics for dashboard
    // Calculate totals and averages
    // Return summary data
  }
  
  async getDetailedReport(brandId, filters) {
    // Detailed analytics with filters
    // Platform comparison
    // Top performing posts
    // Engagement trends
  }
  
  async exportToCSV(brandId, dateRange) {
    // Generate CSV report
  }
}
```

**6.4 Analytics Endpoints**
```javascript
GET    /api/v1/analytics/dashboard
  Query: brandId, period (7d|30d|90d), platforms[]

GET    /api/v1/analytics/reports
  Query: brandId, startDate, endDate, platforms[]

GET    /api/v1/analytics/posts/:postId
  Returns: Platform-specific analytics

POST   /api/v1/analytics/sync/:postId
  Manual analytics refresh

GET    /api/v1/analytics/export
  Query: brandId, startDate, endDate, format (csv)
```

**6.5 Dashboard Metrics**
```javascript
{
  summary: {
    totalPosts: Number,
    totalImpressions: Number,
    totalEngagement: Number,
    avgEngagementRate: Number
  },
  byPlatform: [{
    provider: String,
    posts: Number,
    impressions: Number,
    engagement: Number
  }],
  topPosts: [{
    post: Object,
    metrics: Object
  }],
  trends: [{
    date: String,
    impressions: Number,
    engagement: Number
  }]
}
```

#### Postman Tests:
- ✅ Get dashboard metrics → Returns aggregated data
- ✅ Get detailed report with filters → Returns filtered data
- ✅ Sync post analytics manually → Fetches latest data
- ✅ Export to CSV → Downloads CSV file
- ✅ Get platform comparison → Returns comparison data

---

### **PHASE 7: TEAM & NOTIFICATIONS (Day 19)**

#### Files to Create:
```
src/
├── models/
│   ├── Notification.js
│   └── ActivityLog.js
├── controllers/
│   └── notificationController.js
├── services/
│   ├── notificationService.js
│   └── activityService.js
└── routes/
    └── notifications.js
```

#### Implementation Steps:

**7.1 Notification Model**
```javascript
{
  user: ObjectId,
  type: 'publish_success|publish_failed|member_invited|approval_required',
  title: String,
  message: String,
  data: Object (context data),
  read: Boolean,
  readAt: Date,
  createdAt: Date
}
```

**7.2 Activity Log Model**
```javascript
{
  user: ObjectId,
  brand: ObjectId,
  action: String,
  resource: String,
  resourceId: ObjectId,
  details: Object,
  ipAddress: String,
  userAgent: String,
  createdAt: Date
}
```

**7.3 Notification Service**
```javascript
class NotificationService {
  async createNotification(userId, type, data) {
    // Create in-app notification
  }
  
  async sendEmail(userId, template, data) {
    // Send email via Nodemailer
  }
  
  async sendDailySummary(userId) {
    // Send daily activity summary
  }
  
  async markAsRead(notificationId) {
    // Mark notification as read
  }
}
```

**7.4 Notification Endpoints**
```javascript
GET    /api/v1/notifications
GET    /api/v1/notifications/unread-count
PATCH  /api/v1/notifications/:id/read
PATCH  /api/v1/notifications/read-all
DELETE /api/v1/notifications/:id
```

**7.5 Activity Logging Middleware**
```javascript
function logActivity(action, resource) {
  return async (req, res, next) => {
    // Log user activity
    await ActivityLog.create({
      user: req.user._id,
      brand: req.brand?._id,
      action,
      resource,
      resourceId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    next();
  };
}
```

#### Postman Tests:
- ✅ Get notifications → Returns user notifications
- ✅ Mark as read → Updates notification
- ✅ Get unread count → Returns count
- ✅ Publish post → Creates success notification
- ✅ Failed publish → Sends email notification

---

## 🧪 TESTING STRATEGY

### Postman Collection Structure
```
Social Media Platform API
├── 01. Authentication
│   ├── Register
│   ├── Login
│   ├── Get Profile
│   ├── Update Profile
│   ├── Logout
│   └── Refresh Token
├── 02. Organizations & Brands
│   ├── Create Brand
│   ├── List Brands
│   ├── Update Brand
│   └── Invite Member
├── 03. Channel OAuth
│   ├── Facebook Connect
│   ├── LinkedIn Connect
│   ├── Twitter Connect
│   ├── List Channels
│   └── Test Connection
├── 04. Posts & Media
│   ├── Upload Image
│   ├── Create Post
│   ├── Validate Post
│   ├── Schedule Post
│   └── Publish Now
├── 05. Publishing
│   ├── Check Queue Status
│   ├── Cancel Schedule
│   └── Retry Failed
├── 06. Analytics
│   ├── Dashboard Metrics
│   ├── Detailed Report
│   ├── Export CSV
│   └── Sync Analytics
└── 07. Notifications
    ├── List Notifications
    ├── Mark as Read
    └── Unread Count
```

### Environment Variables (Postman)
```javascript
{
  "base_url": "http://localhost:5000/api/v1",
  "access_token": "{{login_response.token}}",
  "brand_id": "{{create_brand_response._id}}",
  "post_id": "{{create_post_response._id}}"
}
```

---

## 📊 DAILY PROGRESS TRACKING

### Daily Checklist Template
```markdown
## Day X: [Task Name]

### Goals:
- [ ] Feature 1
- [ ] Feature 2
- [ ] Feature 3

### Files Created:
- [ ] models/Model.js
- [ ] controllers/controller.js
- [ ] services/service.js
- [ ] routes/routes.js

### Postman Tests:
- [ ] Test 1: Expected result
- [ ] Test 2: Expected result
- [ ] Test 3: Expected result

### Blockers:
- None / [Issue description]

### Tomorrow:
- Task 1
- Task 2
```

---

## 🚀 DEPLOYMENT PREPARATION

### Environment Variables for Production
```env
# Application
NODE_ENV=production
APP_PORT=5000
APP_URL=https://api.yourdomain.com
CLIENT_URL=https://app.yourdomain.com

# Security
JWT_SECRET=[64-character-random-string]
JWT_REFRESH_SECRET=[64-character-random-string]
SESSION_SECRET=[64-character-random-string]
ENCRYPTION_KEY=[32-character-random-string]

# Database
MONGODB_URI=mongodb+srv://[your-atlas-uri]

# Redis (Production)
REDIS_URL=redis://[your-redis-url]

# OAuth Credentials
FACEBOOK_APP_ID=[production-app-id]
FACEBOOK_APP_SECRET=[production-secret]
LINKEDIN_CLIENT_ID=[production-client-id]
LINKEDIN_CLIENT_SECRET=[production-secret]
# ... etc for all providers
```

### Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] MongoDB indexes created
- [ ] Redis connection tested
- [ ] OAuth redirect URLs updated
- [ ] Email service configured
- [ ] File storage configured (S3)
- [ ] SSL certificates installed
- [ ] Rate limiting configured
- [ ] Logging configured
- [ ] Error monitoring setup (Sentry)
- [ ] Performance monitoring (New Relic)

---

## 📚 RESOURCES & DOCUMENTATION

### API Documentation
- Facebook Graph API: https://developers.facebook.com/docs/graph-api
- LinkedIn Marketing API: https://docs.microsoft.com/en-us/linkedin/marketing
- Twitter API v2: https://developer.twitter.com/en/docs/twitter-api
- Instagram Graph API: https://developers.facebook.com/docs/instagram-api
- YouTube Data API: https://developers.google.com/youtube/v3

### Libraries & Tools
- Express.js: https://expressjs.com
- Mongoose: https://mongoosejs.com
- Bull Queue: https://github.com/OptimalBits/bull
- Passport.js: http://www.passportjs.org
- Sharp: https://sharp.pixelplumbing.com
- Winston: https://github.com/winstonjs/winston

---

## ✅ SUCCESS CRITERIA

### Week 1 Success Metrics
- [ ] User can register and login
- [ ] JWT authentication working
- [ ] Brand creation and management working
- [ ] At least 1 OAuth provider connected (Facebook)

### Week 2 Success Metrics
- [ ] All 4 social platforms connected (FB, LinkedIn, Twitter, Instagram)
- [ ] OAuth tokens stored and encrypted
- [ ] Channel health checks working
- [ ] Token refresh mechanism working

### Week 3 Success Metrics
- [ ] Post creation with media upload
- [ ] Scheduling system working
- [ ] Publishing engine operational
- [ ] Retry mechanism functioning

### Week 4 Success Metrics
- [ ] Analytics collection working
- [ ] Dashboard with metrics
- [ ] CSV export functional
- [ ] All Postman tests passing
- [ ] API documented
- [ ] Ready for deployment

---

## 🎯 FINAL DELIVERABLES

### Code Deliverables
1. ✅ Complete Express.js backend API
2. ✅ MongoDB database with proper indexes
3. ✅ Redis integration for caching and queuing
4. ✅ 4+ social media provider integrations
5. ✅ Queue-based publishing system
6. ✅ Analytics collection and reporting

### Documentation Deliverables
1. ✅ API documentation (Swagger/Postman)
2. ✅ Deployment guide
3. ✅ Environment setup guide
4. ✅ OAuth setup instructions
5. ✅ Troubleshooting guide

### Testing Deliverables
1. ✅ Complete Postman collection
2. ✅ Integration tests
3. ✅ Unit tests for services
4. ✅ Performance benchmarks

---

## 💡 TIPS FOR SUCCESS

### Development Best Practices
1. **Commit Often**: Commit working code at end of each feature
2. **Test Immediately**: Don't wait to test - use Postman after each endpoint
3. **Log Everything**: Use Winston logger for debugging
4. **Handle Errors**: Always implement try-catch and proper error responses
5. **Validate Input**: Use Joi for request validation
6. **Document as You Go**: Update API docs with each new endpoint

### Common Pitfalls to Avoid
❌ **Don't hardcode secrets** - Always use environment variables  
❌ **Don't skip error handling** - Social APIs will fail, handle gracefully  
❌ **Don't forget rate limits** - Implement exponential backoff  
❌ **Don't store tokens unencrypted** - Always encrypt OAuth tokens  
❌ **Don't skip input validation** - Validate all user input  
❌ **Don't ignore timezones** - Use UTC for storage, convert for display  

### Debugging OAuth Issues
1. Check OAuth redirect URL matches exactly (including http vs https)
2. Verify state parameter matches in callback
3. Check token expiration before API calls
4. Log all OAuth responses for debugging
5. Test in browser first, then Postman

---

## 📞 SUPPORT & QUESTIONS

### When Stuck
1. Check API provider documentation
2. Review error logs in `logs/error.log`
3. Test with Postman to isolate issues
4. Check MongoDB queries with Compass
5. Verify Redis data with Redis Commander

### Key Commands
```bash
# Development
npm run dev

# Run tests
npm test

# Check logs
tail -f logs/app.log

# Redis CLI
docker exec -it smp-redis redis-cli

# MongoDB connection test
mongosh "mongodb+srv://..."
```

---

## 🎉 CONCLUSION

This implementation plan migrates your project from Laravel to Express.js, addressing the CSRF and OAuth compatibility issues you faced. Express.js provides a cleaner, more flexible foundation for API-first development with external OAuth integrations.

**Key Advantages of This Migration:**
✅ No CSRF token complications with OAuth callbacks  
✅ Better async/await support for external APIs  
✅ Simpler middleware stack  
✅ Native JSON handling  
✅ Better queue management with Bull  
✅ More flexible authentication with Passport.js  

**Timeline:** 20 days (Oct 7 - Oct 26, 2025)  
**Approach:** Incremental development with daily testing  
**Success Metric:** Production-ready API with 4+ social platform integrations

---

**Ready to start Day 1? Let's build authentication! 🚀**

---

# Start Redis container
docker-compose up -d redis

# Verify it's running with keep-alive
docker exec smp-redis redis-cli CONFIG GET tcp-keepalive

# Check container logs
docker logs smp-redis -f

# Test connection
docker exec smp-redis redis-cli ping

---

 # Since i dind't have Post Management yet, let's add temporary test endpoints to test LinkedIn publishing, added temporary route as well, 
 
 # can't get Linkedin posts throgh API, because of API limitation

# 🚀 QUICK START GUIDE
## Get Your Express.js Backend Running in 5 Minutes

---

## ✅ STEP 1: Install Dependencies

```powershell
cd c:\Projects\React\Social-Media-Marketing-platform-V.2.0.0\server
npm install
```

This will install all required packages (~2-3 minutes).

---

## ✅ STEP 2: Configure Environment

```powershell
# Copy environment template
cp .env.example .env
```

Open `.env` and update these critical values:

```env
# IMPORTANT: Generate secure secrets!
JWT_SECRET=change-this-to-a-random-32-character-string
JWT_REFRESH_SECRET=change-this-to-another-random-32-character-string
SESSION_SECRET=change-this-to-another-random-32-character-string
ENCRYPTION_KEY=32-character-key-for-oauth-tokens

# Your MongoDB URI (already configured)
MONGODB_URI=mongodb+srv://supunprabodha789:Bw7zGpBLXCaDRPld@socialmediamarketingpla...

# Your Google OAuth (get from Google Cloud Console)
GOOGLE_AUTH_CLIENT_ID=your_client_id
GOOGLE_AUTH_CLIENT_SECRET=your_client_secret
```

### 🔑 Generate Secure Secrets

Run this in PowerShell to generate random secrets:

```powershell
# Generate JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Refresh Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Session Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Encryption Key
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

---

## ✅ STEP 3: Start Redis with Docker

```powershell
docker-compose up -d
```

Verify Redis is running:

```powershell
docker ps
```

You should see `smp-redis` container running.

---

## ✅ STEP 4: Start Development Server

```powershell
npm run dev
```

You should see:

```
✅ Environment variables validated
✅ MongoDB Connected Successfully
✅ Redis Cache connected (DB: 0)
✅ Redis Session connected (DB: 1)
✅ Redis Queue connected (DB: 2)
✅ Server running on port 5000
```

---

## ✅ STEP 5: Test with Postman

### Health Check

```http
GET http://localhost:5000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-05T...",
  "uptime": 12.345,
  "environment": "development"
}
```

### API Info

```http
GET http://localhost:5000/api/v1
```

**Expected Response:**
```json
{
  "message": "Social Media Marketing Platform API",
  "version": "2.0.0",
  "status": "active"
}
```

---

## ✅ STEP 6: Verify Connections

### Check MongoDB Connection

Look for this in console:
```
✅ MongoDB Connected Successfully
📊 Database: social_media_platform
```

### Check Redis Connection

Look for these in console:
```
✅ Redis Cache connected (DB: 0)
✅ Redis Session connected (DB: 1)
✅ Redis Queue connected (DB: 2)
```

### Access Redis Commander (Optional)

Open browser: http://localhost:8081

---

## 🎯 YOU'RE READY!

Your backend is now running and ready for development.

**Next Steps:**
1. Review the `ROADMAP.md` file
2. Start implementing Phase 1 (Authentication)
3. Test each feature with Postman as you build

---

## 🛠️ Useful Commands

```powershell
# Development mode (auto-restart)
npm run dev

# Production mode
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Check code style
npm run lint

# Fix code style issues
npm run lint:fix

# Stop Redis
docker-compose down

# View Redis logs
docker-compose logs -f redis

# Restart Redis
docker-compose restart redis
```

---

## 🚨 Troubleshooting

### MongoDB Connection Failed

- Check your internet connection
- Verify MongoDB Atlas credentials in `.env`
- Ensure your IP is whitelisted in MongoDB Atlas

### Redis Connection Failed

- Ensure Docker is running
- Run `docker-compose up -d`
- Check if port 6379 is available

### Port Already in Use

Change `APP_PORT` in `.env`:
```env
APP_PORT=5001
```

---

## 📚 Documentation

- Full roadmap: `ROADMAP.md`
- API docs: Coming in Phase 9
- Environment variables: `.env.example`

---

**Ready to build? Let's start Phase 1! 🚀**

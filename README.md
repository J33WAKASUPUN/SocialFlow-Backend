# Social Media Marketing Platform - Backend API

Express.js + MongoDB backend for managing multiple social media accounts.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ LTS
- MongoDB Atlas account
- Docker (for Redis)
- Git

### Installation

1. **Clone & Navigate**
```bash
cd server
```

2. **Install Dependencies**
```bash
npm install
```

3. **Setup Environment**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Start Redis (Docker)**
```bash
docker-compose up -d
```

5. **Run Development Server**
```bash
npm run dev
```

Server runs on: `http://localhost:5000`

---

## 📁 Project Structure

```
server/
├── src/
│   ├── config/          # Configuration files
│   ├── models/          # Mongoose models
│   ├── controllers/     # Request handlers
│   ├── services/        # Business logic
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   ├── providers/       # Social media adapters
│   ├── jobs/            # Background jobs
│   ├── utils/           # Utilities
│   ├── app.js           # Express app
│   └── server.js        # Entry point
├── tests/               # Test suites
├── uploads/             # File uploads
└── logs/                # Application logs
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration
```

---

## 📚 API Documentation

Base URL: `http://localhost:5000/api/v1`

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login with credentials
- `GET /auth/google` - Google OAuth
- `POST /auth/logout` - Logout user

### Brands
- `GET /brands` - List all brands
- `POST /brands` - Create brand
- `PUT /brands/:id` - Update brand
- `DELETE /brands/:id` - Delete brand

### Channels
- `GET /channels` - List connected channels
- `GET /channels/oauth/:provider` - Start OAuth flow
- `GET /channels/oauth/:provider/callback` - OAuth callback
- `DELETE /channels/:id` - Disconnect channel

### Posts
- `GET /posts` - List posts
- `POST /posts` - Create post
- `PUT /posts/:id` - Update post
- `DELETE /posts/:id` - Delete post
- `POST /posts/:id/publish` - Publish post

### Analytics
- `GET /analytics/dashboard` - Dashboard metrics
- `GET /analytics/reports` - Detailed reports

---

## 🐳 Docker Commands

```bash
# Start Redis
docker-compose up -d

# Stop Redis
docker-compose down

# View logs
docker-compose logs -f redis

# Redis CLI
docker exec -it smp-redis redis-cli
```

---

## 📝 Environment Variables

See `.env.example` for all available configuration options.

---

## 🔧 Scripts

- `npm start` - Production server
- `npm run dev` - Development with nodemon
- `npm test` - Run tests
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix code style issues

---

## 📄 License

MIT License - Jeewaka Supun

---

## 🤝 Contributing

1. Create feature branch
2. Commit changes
3. Push to branch
4. Open pull request

---

Built with ❤️ using Express.js + MongoDB

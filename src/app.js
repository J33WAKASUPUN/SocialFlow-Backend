const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const path = require("path");
const logger = require("./utils/logger");
const { apiLimiter } = require("./middlewares/rateLimiter");
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const database = require("./config/database");
const RedisStore = require("connect-redis").default;
const redisClient = require("./config/redis");
const passport = require("passport");
const session = require("express-session");


// const MongoStore = require("connect-mongo");
require("./config/googleOauth");

/**
 * Initialize Express Application
 */
function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.set('query parser', (str) => {
  return require('qs').parse(str, {
    allowDots: true,
    depth: 5,
  });
});

  // SECURITY MIDDLEWARE
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // For inline styles
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"], // Allow images from S3/Cloudinary
        connectSrc: ["'self'", process.env.CLIENT_URL],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", "https:"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
  }));
  
  app.use(mongoSanitize());

  // STRICTER CORS CONFIGURATION
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:3000',
    process.env.CLIENT_URL
  ].filter(Boolean);

  const corsOptions = {
    origin: function (origin, callback) {
      // Reject requests with no origin in production
      if (!origin) {
        if (process.env.NODE_ENV === 'production') {
          logger.warn('🚫 CORS blocked request with no origin header');
          return callback(new Error('Not allowed by CORS - missing origin'));
        }
        // Allow in development (for Postman, curl, etc.)
        return callback(null, true);
      }
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.warn('🚫 CORS blocked request from:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 600,
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // ============================================
  // BODY PARSING
  // ============================================
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // ============================================
  // COMPRESSION
  // ============================================
  app.use(compression());

  // ============================================
  // HTTP REQUEST LOGGING
  // ============================================
  if (process.env.NODE_ENV === "development") {
    app.use(morgan("dev"));
  } else {
    app.use(morgan("combined", { stream: logger.stream }));
  }

  // ============================================
  // SERVE STATIC FILES
  // ============================================
  app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

  app.use("/uploads/media", (req, res, next) => {
    const filePath = path.join(__dirname, "../uploads/media", req.path);
    const ext = path.extname(req.path).toLowerCase();
    
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
    };
    
    if (mimeTypes[ext]) {
      res.type(mimeTypes[ext]);
    }
    
    next();
  }, express.static(path.join(__dirname, "../uploads/media")));

  // ============================================
  // SESSION (NOW USING REDIS)
  // ============================================
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      
      store: new RedisStore({
        client: redisClient.getSession(), // Uses the client from your RedisClient.js
        prefix: "sess:", // Optional: adds a prefix to session keys in Redis
        ttl: parseInt(process.env.SESSION_LIFETIME) || 7200, // Time to live in seconds
      }),

      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: (parseInt(process.env.SESSION_LIFETIME) || 7200) * 1000,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      },
    })
  );

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================

// Main health check
app.get("/health", async (req, res) => {
  try {
    // Check MongoDB
    const mongoStatus = database.isConnected() ? "connected" : "disconnected";
    
    // Check Redis with detailed status
    let redisStatus = "disconnected";
    let redisDetails = {
      cache: false,
      session: false,
      queue: false
    };
    
    try {
      const healthCheck = await redisClient.healthCheck();
      redisStatus = healthCheck ? "connected" : "disconnected";
      redisDetails = {
        cache: redisClient.getCache()?.isOpen || false,
        session: redisClient.getSession()?.isOpen || false,
        queue: redisClient.getQueue()?.isOpen || false
      };
    } catch (error) {
      logger.error('Redis health check failed:', error.message);
    }

    const isHealthy = mongoStatus === "connected" && redisStatus === "connected";

    const health = {
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV,
      version: "2.0.0",
      services: {
        mongodb: {
          status: mongoStatus,
          host: database.connection?.connection?.host || "N/A",
          database: database.connection?.connection?.name || "N/A"
        },
        redis: {
          status: redisStatus,
          ...redisDetails
        }
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        unit: "MB"
      },
      cpu: {
        user: process.cpuUsage().user,
        system: process.cpuUsage().system
      }
    };

    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      message: error.message,
    });
  }
});

// Worker health check endpoint
app.get('/workers/health', async (req, res) => {
  try {
    const workerManager = require('./workers');
    const queueManager = require('./queues/queueManager');
    
    const health = await workerManager.healthCheck();
    const stats = await queueManager.getStats();
    const failedJobs = await queueManager.getFailedJobs(3);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      workers: health,
      queue: {
        stats,
        recentFailures: failedJobs
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Readiness check (for Kubernetes/Azure)
app.get("/ready", async (req, res) => {
  try {
    const isDbReady = database.isConnected();
    const isRedisReady = redisClient.getCache()?.isOpen || false;

    if (isDbReady && isRedisReady) {
      res.status(200).json({
        status: "ready",
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: "not ready",
        services: {
          database: isDbReady,
          redis: isRedisReady
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: "not ready",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Liveness check (simple ping)
app.get("/ping", (req, res) => {
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

  // ============================================
  // API DOCUMENTATION (SWAGGER)
  // ============================================
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // ============================================
  // API ROUTES
  // ============================================
  const authRoutes = require("./routes/auth");
  const organizationRoutes = require("./routes/organizations");
  const brandRoutes = require("./routes/brands");
  const channelRoutes = require("./routes/channels");
  const postRoutes = require("./routes/posts"); 
  const analyticsRoutes = require('./routes/analytics');
  const mediaRoutes = require('./routes/media');
  const notificationRoutes = require('./routes/notifications'); 
  const whatsappRoutes = require('./routes/whatsapp');


  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/organizations", organizationRoutes);
  app.use("/api/v1/brands", brandRoutes);
  app.use("/api/v1/channels", channelRoutes);
  app.use("/api/v1/posts", postRoutes);
  app.use("/api", apiLimiter);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/media', mediaRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/whatsapp', whatsappRoutes);


  // API Info Endpoint
  app.get("/api/v1", (req, res) => {
    res.json({
      message: "Social Media Marketing Platform API",
      version: "2.0.0",
      status: "active",
      endpoints: {
        auth: "/api/v1/auth",
        organizations: "/api/v1/organizations",
        brands: "/api/v1/brands",
        channels: "/api/v1/channels",
        posts: "/api/v1/posts",
        analytics: "/api/v1/analytics",
        media: "/api/v1/media",
        notifications: "/api/v1/notifications",
        docs: "/api-docs",
      },
    });
  });

  // ============================================
  // 404 HANDLER
  // ============================================
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: "Route not found",
      path: req.originalUrl,
    });
  });

  // ============================================
  // GLOBAL ERROR HANDLER
  // ============================================
  app.use((err, req, res, next) => {
    logger.error("Error:", err);

    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(statusCode).json({
      success: false,
      message: message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
  });

  return app;
}

module.exports = createApp;
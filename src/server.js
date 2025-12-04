// ---------------------------------------------------------
// 🚨 DEBUG LOGS
// ---------------------------------------------------------
console.log("🔵 [1] Node.js process started.");
console.log("🔵 [2] Loading modules...");

try {
  require("dotenv").config();
  console.log("✅ [3] dotenv loaded.");
} catch (e) {
  console.error("🔴 Error loading dotenv:", e.message);
}

const { validateEnv } = require("./config/env");
const database = require("./config/database");
const redisClient = require("./config/redis");
const createApp = require("./app");
const logger = require("./utils/logger");
const workerManager = require('./workers');

class ServerBootstrap {
  constructor() {
    this.server = null;
    this.isShuttingDown = false;
  }

  async start() {
    console.log("🔵 [4] ServerBootstrap.start() called.");
    try {
      logger.info("🚀 Initializing Social Media Platform...");

      // 1. CREATE APP & START HTTP SERVER IMMEDIATELY
      const app = createApp();
      await this.startHttpServer(app);

      // 2. Validate Env (Non-blocking)
      try {
        validateEnv();
      } catch (e) {
        logger.error("❌ Env Validation Error:", e.message);
      }

      // 3. Connect Databases (Background)
      this.connectServices();

    } catch (error) {
      console.error("🔴 Fatal Error during startup:", error);
      logger.error("❌ Fatal Error:", error);
    }
  }

  async connectServices() {
    try {
      console.log("🔵 [5] Connecting to Services...");
      // MongoDB
      if (process.env.MONGODB_URI) {
        await database.connect();
        logger.info("✅ MongoDB Connected");
      }

      // Redis
      if (process.env.REDIS_HOST) {
        await redisClient.connect();
        logger.info("✅ Redis Connected");
      }

      // Workers
      workerManager.start();
      logger.info("✅ Workers Running");
      
      this.logStartupInfo();

    } catch (error) {
      logger.error("❌ Service Connection Failed (Non-fatal):", error.message);
    }
  }

  async startHttpServer(app) {
    return new Promise((resolve, reject) => {
      const PORT = process.env.PORT || 5000;
      this.server = app.listen(PORT, '0.0.0.0', (err) => {
        if (err) return reject(err);
        console.log(`✅ [SUCCESS] HTTP Server listening on port ${PORT}`);
        logger.info(`✅ HTTP Server listening on port ${PORT}`);
        resolve();
      });
    });
  }

  logStartupInfo() {
    logger.info(`
    ================================================
    🎉 FULLY STARTED
    🚀 URL: ${process.env.APP_URL}
    ================================================
    `);
  }
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      logger.info(`\n📴 ${signal} received. Shutting down...`);
      
      if (this.server) this.server.close();
      await workerManager.stop().catch(e => logger.error(e));
      await redisClient.disconnect().catch(e => logger.error(e));
      await database.disconnect().catch(e => logger.error(e));
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

const bootstrap = new ServerBootstrap();
bootstrap.start();
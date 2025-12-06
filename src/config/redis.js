const redis = require('redis');
const logger = require('../utils/logger');

/**
 * Redis Connection Configuration
 * Manages multiple Redis databases for cache, session, and queue
 */
class RedisClient {
  constructor() {
    this.cacheClient = null;
    this.sessionClient = null;
    this.queueClient = null;
    this.isConnecting = false;
  }

  /**
   * Create Redis client with specific DB
   */
  createClient(db, name) {
    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = parseInt(process.env.REDIS_PORT || 6379, 10);
    const password = process.env.REDIS_PASSWORD;

    const isTls = port === 6380 || process.env.NODE_ENV === 'production';

    logger.info(`Creating Redis ${name} client:`, {
      host,
      port,
      db,
      tls: isTls,
      hasPassword: !!password
    });

   const config = {
      database: db,
      socket: {
        host: host,
        port: port,
        tls: isTls,
        rejectUnauthorized: false, 
        // ✅ INCREASE PING FREQUENCY TO PREVENT IDLE DISCONNECTS
        pingInterval: 10000, // Ping every 10 seconds (was 20s)
        keepAlive: 5000,     // TCP keep-alive every 5 seconds (was 10s)
        reconnectStrategy: (retries) => {
          if (retries > 20) {
            logger.error(`Redis ${name} max retries reached`);
            return new Error('Max retries reached');
          }
          const delay = Math.min(retries * 100, 3000);
          logger.warn(`Redis ${name} reconnecting... attempt ${retries}, delay: ${delay}ms`);
          return delay;
        },
        connectTimeout: 20000,
        noDelay: true,
      },
      commandsQueueMaxLength: 1000,
      enableOfflineQueue: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 10) {
          return null;
        }
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    };

    // Only add password if it exists and is not empty
    if (password && password.trim() !== '') {
      config.password = password;
    }

    const client = redis.createClient(config);

    // Improved error handling - suppress ECONNRESET spam
    client.on('error', (err) => {
      // Don't log reconnection errors (they're expected with Azure Redis)
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
        logger.debug(`Redis ${name} connection reset (normal for Azure)`);
      } else {
        logger.error(`❌ Redis ${name} error:`, {
          message: err.message,
          code: err.code,
        });
      }
    });

    client.on('connect', () => {
      logger.info(`✅ Redis ${name} connected (DB: ${db})`);
    });

    client.on('ready', () => {
      logger.info(`🚀 Redis ${name} ready`);
    });

    client.on('reconnecting', () => {
      logger.info(`🔄 Redis ${name} reconnecting...`);
    });

    client.on('end', () => {
      logger.warn(`⚠️ Redis ${name} connection closed`);
    });

    return client;
  }

  /**
   * Initialize all Redis connections
   */
  async connect() {
    if (this.isConnecting) {
      logger.warn('Redis connection already in progress');
      return false;
    }

    this.isConnecting = true;

    try {
      logger.info('🔌 Initializing Redis connections...');

      // Create clients
      this.cacheClient = this.createClient(
        parseInt(process.env.REDIS_DB_CACHE || 0, 10),
        'Cache'
      );

      this.sessionClient = this.createClient(
        parseInt(process.env.REDIS_DB_SESSION || 1, 10),
        'Session'
      );

      this.queueClient = this.createClient(
        parseInt(process.env.REDIS_DB_QUEUE || 2, 10),
        'Queue'
      );

      // Connect with timeout protection
      logger.info('Connecting to Redis Cache...');
      await this.connectWithTimeout(this.cacheClient, 'Cache', 30000);
      
      logger.info('Connecting to Redis Session...');
      await this.connectWithTimeout(this.sessionClient, 'Session', 30000);
      
      logger.info('Connecting to Redis Queue...');
      await this.connectWithTimeout(this.queueClient, 'Queue', 30000);

      logger.info('✅ All Redis clients connected successfully');

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Start periodic health check
      this.startHealthCheck();

      this.isConnecting = false;
      return true;
    } catch (error) {
      this.isConnecting = false;
      logger.error('❌ Redis connection failed:', {
        message: error.message,
        stack: error.stack
      });
      
      // Clean up any partial connections
      await this.disconnect();
      
      throw error;
    }
  }

  /**
   * Start periodic health check to keep connections alive
   */
  startHealthCheck() {
    // Ping Redis every 20 seconds to keep connection alive
    this.healthCheckInterval = setInterval(async () => {
      try {
        if (this.queueClient?.isOpen) {
          await this.queueClient.ping();
        }
      } catch (error) {
        // Silently handle ping errors
        if (error.code !== 'ECONNRESET') {
          logger.debug('Redis ping error:', error.message);
        }
      }
    }, 20000); // Every 20 seconds
  }

  /**
   * Connect with timeout
   */
  async connectWithTimeout(client, name, timeout = 30000) {
    return Promise.race([
      client.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${name} connection timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`📴 Received ${signal}, closing Redis connections...`);
      
      // Clear health check interval
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      
      await this.disconnect();
      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * Disconnect all Redis clients
   */
  async disconnect() {
    try {
      // Clear health check interval
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      const promises = [];

      if (this.cacheClient?.isOpen) {
        logger.info('Disconnecting Redis Cache...');
        promises.push(
          this.cacheClient.quit().catch(err => {
            logger.error('Error disconnecting cache client:', err.message);
          })
        );
      }

      if (this.sessionClient?.isOpen) {
        logger.info('Disconnecting Redis Session...');
        promises.push(
          this.sessionClient.quit().catch(err => {
            logger.error('Error disconnecting session client:', err.message);
          })
        );
      }

      if (this.queueClient?.isOpen) {
        logger.info('Disconnecting Redis Queue...');
        promises.push(
          this.queueClient.quit().catch(err => {
            logger.error('Error disconnecting queue client:', err.message);
          })
        );
      }

      await Promise.all(promises);
      logger.info('🔌 All Redis clients disconnected');
    } catch (error) {
      logger.error('Error during Redis disconnect:', error.message);
    }
  }

  /**
   * Get cache client
   */
  getCache() {
    if (!this.cacheClient?.isOpen) {
      logger.warn('Cache client not connected');
    }
    return this.cacheClient;
  }

  /**
   * Get session client
   */
  getSession() {
    if (!this.sessionClient?.isOpen) {
      logger.warn('Session client not connected');
    }
    return this.sessionClient;
  }

  /**
   * Get queue client
   */
  getQueue() {
    if (!this.queueClient?.isOpen) {
      logger.warn('Queue client not connected');
    }
    return this.queueClient;
  }

  /**
   * Health check for all Redis clients
   */
  async healthCheck() {
    try {
      const results = await Promise.allSettled([
        this.cacheClient?.ping(),
        this.sessionClient?.ping(),
        this.queueClient?.ping(),
      ]);

      const allHealthy = results.every(
        result => result.status === 'fulfilled' && result.value === 'PONG'
      );

      if (!allHealthy) {
        logger.warn('Redis health check failed:', results);
      }

      return allHealthy;
    } catch (error) {
      logger.error('Redis health check error:', error.message);
      return false;
    }
  }
}

module.exports = new RedisClient();
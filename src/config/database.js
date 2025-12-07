const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * MongoDB Connection Configuration
 * Supports both MongoDB Atlas and Azure Cosmos DB
 */
class Database {
  constructor() {
    this.connection = null;
    this.isConnecting = false;
  }

  /**
   * Connect to MongoDB/Cosmos DB
   */
  async connect() {
    if (this.isConnecting) {
      logger.warn('Database connection already in progress');
      return this.connection;
    }

    this.isConnecting = true;

    try {
      const isCosmosDB = process.env.MONGODB_URI?.includes('cosmos.azure.com');
      
      logger.info('🔌 Connecting to database...', {
        type: isCosmosDB ? 'Azure Cosmos DB' : 'MongoDB',
        uri: this.maskUri(process.env.MONGODB_URI)
      });

const options = {
  maxPoolSize: isCosmosDB ? 50 : 10,
  minPoolSize: isCosmosDB ? 5 : 2,
  
  // CRITICAL: Reduce these timeouts for faster failure
  serverSelectionTimeoutMS: 10000,  // Was 30000 - reduce to 10s
  socketTimeoutMS: 20000,            // Was 45000 - reduce to 20s
  connectTimeoutMS: 10000,           // Was 30000 - reduce to 10s
  
  ssl: isCosmosDB ? true : undefined,
  retryWrites: isCosmosDB ? false : true,
  family: 4,
  heartbeatFrequencyMS: 10000,
};

      // Connect with timeout
      this.connection = await Promise.race([
        mongoose.connect(process.env.MONGODB_URI, options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database connection timeout after 30s')), 30000)
        )
      ]);

      logger.info('✅ Database Connected Successfully');
      logger.info(`📊 Database: ${this.connection.connection.name}`);
      logger.info(`🌐 Host: ${this.connection.connection.host}`);
      logger.info(`🔗 Ready State: ${this.getReadyStateText()}`);

      // Setup event handlers
      this.setupEventHandlers();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      this.isConnecting = false;
      return this.connection;
    } catch (error) {
      this.isConnecting = false;
      logger.error('❌ Database connection failed:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      
      // Don't exit in production - let health checks handle it
      if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
      }
      
      throw error;
    }
  }

  /**
   * Setup database event handlers
   */
  setupEventHandlers() {
    mongoose.connection.on('error', (err) => {
      logger.error('❌ Database error:', {
        message: err.message,
        code: err.code
      });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ Database disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('✅ Database reconnected');
    });

    mongoose.connection.on('connected', () => {
      logger.info('🔗 Database connected');
    });
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`📴 Received ${signal}, closing database connection...`);
      await this.disconnect();
      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnect() {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        logger.info('🔌 Database connection closed');
      }
    } catch (error) {
      logger.error('Error closing database connection:', error.message);
    }
  }

  /**
   * Get connection status
   */
  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  /**
   * Get ready state as text
   */
  getReadyStateText() {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[mongoose.connection.readyState] || 'unknown';
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.isConnected()) {
      logger.warn('Database not connected');
      return null;
    }
    return mongoose.connection.db;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.isConnected()) {
        return { healthy: false, message: 'Not connected' };
      }

      // Ping the database
      await mongoose.connection.db.admin().ping();
      
      return {
        healthy: true,
        state: this.getReadyStateText(),
        host: mongoose.connection.host,
        name: mongoose.connection.name
      };
    } catch (error) {
      logger.error('Database health check failed:', error.message);
      return {
        healthy: false,
        message: error.message
      };
    }
  }

  /**
   * Mask sensitive data in URI
   */
  maskUri(uri) {
    if (!uri) return 'N/A';
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  }
}

module.exports = new Database();
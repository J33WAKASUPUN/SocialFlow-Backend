const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Sensitive data redaction
const sensitiveFields = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'sessionId',
  '2fa',
  'otp',
  'code',
  'resetPasswordToken',
];

const redactSensitiveData = winston.format((info) => {
  const redact = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    Object.keys(obj).forEach(key => {
      const lowerKey = key.toLowerCase();
      
      // Check if key contains sensitive field name
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        redact(obj[key]); // Recursively redact nested objects
      }
    });
    
    return obj;
  };

  return redact(info);
});

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  redactSensitiveData(),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      log += ` ${JSON.stringify(metadata)}`;
    }
    
    return stack ? `${log}\n${stack}` : log;
  })
);

/**
 * Console format with colors
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let log = `${timestamp} ${level}: ${message}`;
    
    // Add metadata if present (except in production)
    if (process.env.NODE_ENV !== 'production' && Object.keys(metadata).length > 0) {
      const cleanMetadata = { ...metadata };
      // Remove winston internal fields
      delete cleanMetadata.timestamp;
      delete cleanMetadata.level;
      delete cleanMetadata.message;
      
      if (Object.keys(cleanMetadata).length > 0) {
        log += ` ${JSON.stringify(cleanMetadata)}`;
      }
    }
    
    return log;
  })
);

/**
 * Filter to suppress noisy logs in production
 */
const productionFilter = winston.format((info) => {
  // In production, suppress these logs:
  if (process.env.NODE_ENV === 'production') {
    const message = info.message?.toLowerCase() || '';
    
    // Suppress Redis reconnection warnings (they're normal with Azure)
    if (
      (info.level === 'warn' && message.includes('reconnecting')) ||
      (info.level === 'warn' && message.includes('redis')) ||
      (info.level === 'info' && message.includes('redis') && message.includes('reconnecting'))
    ) {
      return false; // Don't log
    }
    
    // Suppress Redis connection reset errors (normal for Azure Redis)
    if (
      info.level === 'error' && 
      (message.includes('econnreset') || message.includes('connection reset'))
    ) {
      return false; // Don't log
    }
    
    // Suppress database disconnection warnings (normal during reconnects)
    if (
      info.level === 'warn' && 
      (message.includes('database disconnected') || message.includes('db disconnected'))
    ) {
      return false; // Don't log
    }
  }
  
  return info;
});

/**
 * Winston logger instance
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    productionFilter(),
    logFormat
  ),
  transports: [
    // Write all logs to app.log
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write errors to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

/**
 * Console logging for development
 */
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        productionFilter(),
        consoleFormat
      ),
    })
  );
} else {
  // In production, still log to console but with filters
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        productionFilter(),
        consoleFormat
      ),
      level: 'info', // Only info and above in production console
    })
  );
}

/**
 * Stream for Morgan HTTP logger
 */
logger.stream = {
  write: (message) => {
    // Trim and log HTTP requests
    const trimmedMessage = message.trim();
    
    // In production, only log errors and important requests
    if (process.env.NODE_ENV === 'production') {
      // Only log if it's an error (4xx, 5xx) or important endpoint
      if (
        trimmedMessage.includes(' 4') || 
        trimmedMessage.includes(' 5') ||
        trimmedMessage.includes('POST') ||
        trimmedMessage.includes('DELETE') ||
        trimmedMessage.includes('PATCH')
      ) {
        logger.info(trimmedMessage);
      }
    } else {
      // In development, log everything
      logger.info(trimmedMessage);
    }
  },
};

/**
 * Add custom log levels for queue operations
 */
logger.queue = {
  info: (message, meta = {}) => {
    logger.info(`[QUEUE] ${message}`, meta);
  },
  error: (message, meta = {}) => {
    logger.error(`[QUEUE] ${message}`, meta);
  },
  warn: (message, meta = {}) => {
    logger.warn(`[QUEUE] ${message}`, meta);
  },
};

/**
 * Add custom log levels for providers
 */
logger.provider = {
  info: (provider, message, meta = {}) => {
    logger.info(`[${provider.toUpperCase()}] ${message}`, meta);
  },
  error: (provider, message, meta = {}) => {
    logger.error(`[${provider.toUpperCase()}] ${message}`, meta);
  },
  warn: (provider, message, meta = {}) => {
    logger.warn(`[${provider.toUpperCase()}] ${message}`, meta);
  },
};

/**
 * Add helper to log database operations
 */
logger.db = {
  info: (message, meta = {}) => {
    if (process.env.NODE_ENV !== 'production' || meta.critical) {
      logger.info(`[DATABASE] ${message}`, meta);
    }
  },
  error: (message, meta = {}) => {
    logger.error(`[DATABASE] ${message}`, meta);
  },
  warn: (message, meta = {}) => {
    // Suppress normal reconnection warnings in production
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`[DATABASE] ${message}`, meta);
    }
  },
};

/**
 * Add helper to log Redis operations
 */
logger.redis = {
  info: (message, meta = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[REDIS] ${message}`, meta);
    }
  },
  error: (message, meta = {}) => {
    // Only log critical Redis errors in production
    if (meta.critical || process.env.NODE_ENV !== 'production') {
      logger.error(`[REDIS] ${message}`, meta);
    }
  },
  warn: (message, meta = {}) => {
    // Suppress reconnection warnings in production
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(`[REDIS] ${message}`, meta);
    }
  },
};

module.exports = logger;
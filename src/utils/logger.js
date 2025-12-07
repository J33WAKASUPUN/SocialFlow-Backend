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

// ✅ FIX: Handle circular references in redaction
const redactSensitiveData = winston.format((info) => {
  const seen = new WeakSet();
  
  const redact = (obj) => {
    if (obj !== null && typeof obj === 'object') {
      if (seen.has(obj)) {
        return '[Circular Reference]';
      }
      seen.add(obj);
    }

    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => redact(item));
    }

    const redacted = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redact(value);
      }
    }
    return redacted;
  };

  if (info.message && typeof info.message === 'object') {
    info.message = redact(info.message);
  }

  Object.keys(info).forEach(key => {
    if (key !== 'level' && key !== 'timestamp' && key !== 'label') {
      info[key] = redact(info[key]);
    }
  });

  return info;
});

// ✅ FIX: Safe JSON stringification in printf
const safeStringify = (obj) => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  }, 2);
};

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  redactSensitiveData(),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      // ✅ USE safeStringify instead of JSON.stringify
      log += `\n${safeStringify(metadata)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let log = `${timestamp} ${level}: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      // ✅ USE safeStringify instead of JSON.stringify
      log += `\n${safeStringify(metadata)}`;
    }
    
    return log;
  })
);

// Filter to suppress noisy logs in production
const productionFilter = winston.format((info) => {
  const noisyPatterns = [
    /polling for media processing/i,
    /attempt \d+: status =/i,
    /waiting for processing/i,
  ];
  
  if (process.env.NODE_ENV === 'production') {
    const message = typeof info.message === 'string' ? info.message : JSON.stringify(info.message);
    if (noisyPatterns.some(pattern => pattern.test(message))) {
      return false;
    }
  }
  
  return info;
});

// Winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
  exitOnError: false,
});

module.exports = logger;
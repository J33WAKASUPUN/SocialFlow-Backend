const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Ensure upload directories exist (temporary storage before S3 upload)
const uploadsDir = path.join(__dirname, '../../uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
const mediaDir = path.join(uploadsDir, 'media');

[uploadsDir, avatarsDir, mediaDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info('📁 Created upload directory', { dir });
  }
});

// Temporary local storage (files will be uploaded to S3 after)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    logger.info('📥 Avatar upload destination', { 
      fieldname: file.fieldname,
      originalname: file.originalname 
    });
    cb(null, avatarsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    const filename = `avatar-temp-${uniqueSuffix}${ext}`;
    logger.info('📝 Generated avatar filename', { filename });
    cb(null, filename);
  },
});

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    logger.info('📥 Media upload destination', { 
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype 
    });
    cb(null, mediaDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    const prefix = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const filename = `${prefix}-temp-${uniqueSuffix}${ext}`;
    logger.info('📝 Generated media filename', { filename, mimetype: file.mimetype });
    cb(null, filename);
  },
});

// File filters
const imageFilter = (req, file, cb) => {
  logger.info('🔍 Checking image filter', { 
    originalname: file.originalname,
    mimetype: file.mimetype 
  });
  
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    logger.info('✅ Image filter passed');
    cb(null, true);
  } else {
    logger.error('❌ Image filter failed', { 
      originalname: file.originalname,
      mimetype: file.mimetype 
    });
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)'));
  }
};

const mediaFilter = (req, file, cb) => {
  logger.info('🔍 Checking media filter', { 
    originalname: file.originalname,
    mimetype: file.mimetype 
  });
  
  const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|wmv|flv|webm|mkv/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  if (extname) {
    logger.info('✅ Media filter passed');
    cb(null, true);
  } else {
    logger.error('❌ Media filter failed', { 
      originalname: file.originalname,
      mimetype: file.mimetype,
      extension: path.extname(file.originalname)
    });
    cb(new Error('Only image and video files are allowed'));
  }
};

// Multer instances
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter,
}).single('avatar');

const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: mediaFilter,
}).array('media', 10); // Max 10 files

// Enhanced middleware wrapper with better error handling
const uploadMediaWithLogging = (req, res, next) => {
  logger.info('📤 Upload middleware triggered', {
    method: req.method,
    url: req.url,
    contentType: req.headers['content-type'],
  });

  uploadMedia(req, res, (err) => {
    if (err) {
      logger.error('❌ Multer upload error', {
        error: err.message,
        code: err.code,
        field: err.field,
      });

      if (err instanceof multer.MulterError) {
        // Multer-specific errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size is 100MB.',
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum is 10 files.',
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: `Unexpected field: ${err.field}. Use 'media' as the field name.`,
          });
        }
      }

      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    // Log successful upload
    if (req.files && req.files.length > 0) {
      logger.info('✅ Files uploaded to temp storage', {
        count: req.files.length,
        files: req.files.map(f => ({
          originalname: f.originalname,
          size: `${(f.size / 1024).toFixed(2)}KB`,
          path: f.path,
        })),
      });
    } else {
      logger.warn('⚠️ No files received by multer', {
        bodyKeys: Object.keys(req.body),
        hasFiles: !!req.files,
      });
    }

    next();
  });
};

module.exports = {
  uploadAvatar,
  uploadMedia: uploadMediaWithLogging, // Use the enhanced version
};
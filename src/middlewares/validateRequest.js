const Joi = require('joi');

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }

    next();
  };
};

// Validation schemas
const schemas = {
  publishPost: Joi.object({
    content: Joi.string().required().min(1).max(10000),
    title: Joi.string().optional().max(200),
    mediaUrls: Joi.alternatives().try(
      Joi.array().items(Joi.string().uri()),
      Joi.string()
    ).optional(),
  }),

  updatePost: Joi.object({
    platformPostId: Joi.string().required(),
    content: Joi.string().required().min(1).max(10000),
  }),

  deletePost: Joi.object({
    platformPostId: Joi.string().required(),
  }),
};

module.exports = {
  validateRequest,
  schemas,
};
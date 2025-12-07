const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Social Media Marketing Platform API',
      version: '2.0.0',
      description: 'Multi-platform social media publishing and analytics API',
      contact: {
        name: 'API Support',
        email: 'support@socialmedia.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.APP_URL || 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: 'https://api.yourdomain.com',
        description: 'Production server',
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            name: { type: 'string', example: 'John Doe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            avatar: { type: 'string', example: 'https://example.com/avatar.jpg' },
            status: { type: 'string', enum: ['active', 'inactive'], example: 'active' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Brand: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string', example: 'My Brand' },
            organization: { type: 'string' },
            description: { type: 'string' },
            settings: { type: 'object' }
          }
        },
        Channel: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            provider: { type: 'string', enum: ['facebook', 'linkedin', 'twitter', 'instagram', 'youtube'], example: 'facebook' },
            platformUserId: { type: 'string' },
            platformUsername: { type: 'string' },
            displayName: { type: 'string' },
            isConnected: { type: 'boolean' },
            lastSync: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message' }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js'], // ✅ Path to route files with JSDoc
};

module.exports = swaggerJsdoc(options);
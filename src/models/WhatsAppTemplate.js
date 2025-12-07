const mongoose = require('mongoose');

const whatsappTemplateSchema = new mongoose.Schema({
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
    index: true,
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  language: {
    type: String,
    required: true,
    default: 'en',
  },
  category: {
    type: String,
    enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
    required: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
  },
  components: [{
    type: {
      type: String,
      enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'],
    },
    format: String, // TEXT, IMAGE, VIDEO, DOCUMENT
    text: String,
    example: mongoose.Schema.Types.Mixed,
    buttons: [{
      type: String,
      text: String,
      url: String,
      phone_number: String,
    }],
  }],
  platformTemplateId: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

whatsappTemplateSchema.index({ brand: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('WhatsAppTemplate', whatsappTemplateSchema);
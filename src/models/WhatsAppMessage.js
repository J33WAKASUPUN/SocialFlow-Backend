const mongoose = require('mongoose');

const whatsappMessageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    index: true,
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    index: true,
  },
  from: {
    type: String,
    required: true,
    index: true,
  },
  to: {
    type: String,
    required: true,
  },
  phoneNumberId: {
    type: String,
    required: true,
    index: true,
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'document', 'template', 'interactive'],
    required: true,
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed', 'received'],
    default: 'sent',
    index: true,
  },
  content: {
    text: String,
    image: {
      id: String,
      mime_type: String,
      sha256: String,
      caption: String,
    },
    video: {
      id: String,
      mime_type: String,
      sha256: String,
      caption: String,
    },
    audio: {
      id: String,
      mime_type: String,
      sha256: String,
    },
    document: {
      id: String,
      filename: String,
      mime_type: String,
      sha256: String,
      caption: String,
    },
    template: {
      name: String,
      language: String,
      components: mongoose.Schema.Types.Mixed,
    },
  },
  timestamp: {
    type: Date,
    required: true,
    index: true,
  },
  lastStatusUpdate: {
    type: Date,
  },
  errors: [{
    code: Number,
    title: String,
    message: String,
    error_data: mongoose.Schema.Types.Mixed,
  }],
  metadata: {
    displayPhoneNumber: String,
    phoneNumberId: String,
    contactName: String,
    conversationId: String,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
whatsappMessageSchema.index({ phoneNumberId: 1, timestamp: -1 });
whatsappMessageSchema.index({ from: 1, timestamp: -1 });
whatsappMessageSchema.index({ brand: 1, timestamp: -1 });
whatsappMessageSchema.index({ direction: 1, status: 1, timestamp: -1 });

module.exports = mongoose.model('WhatsAppMessage', whatsappMessageSchema);
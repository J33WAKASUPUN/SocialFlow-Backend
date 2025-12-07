const mongoose = require('mongoose');

const whatsappContactSchema = new mongoose.Schema({
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // E.164 format: +[country code][number]
        return /^\+[1-9]\d{1,14}$/.test(v);
      },
      message: 'Phone must be in E.164 format (e.g., +14155552671)'
    },
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  tags: [String],
  groups: [String],
  customFields: {
    type: Map,
    of: String,
  },
  optedIn: {
    type: Boolean,
    default: false,
  },
  optedInAt: Date,
  optedOutAt: Date,
  lastMessageSentAt: Date,
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

whatsappContactSchema.index({ brand: 1, phone: 1 }, { unique: true });
whatsappContactSchema.index({ brand: 1, tags: 1 });
whatsappContactSchema.index({ brand: 1, groups: 1 });

module.exports = mongoose.model('WhatsAppContact', whatsappContactSchema);
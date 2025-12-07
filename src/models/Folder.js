const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
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
  description: {
    type: String,
    maxlength: 500,
  },
  color: {
    type: String,
    default: '#667eea',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  timestamps: true,
});

folderSchema.index({ brand: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Folder', folderSchema);
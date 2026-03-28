const mongoose = require('mongoose');

const uploadHistorySchema = new mongoose.Schema({
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Target user is required']
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Uploader is required']
  },
  phoneDataId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PhoneData',
    default: null
  },
  totalCount: {
    type: Number,
    required: true,
    default: 0
  },
  fileName: {
    type: String,
    required: true
  },
  isDownloaded: {
    type: Boolean,
    default: false
  },
  downloadedAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

uploadHistorySchema.index({ targetUser: 1 });
uploadHistorySchema.index({ uploadedBy: 1 });

module.exports = mongoose.model('UploadHistory', uploadHistorySchema);

const mongoose = require('mongoose');

const dailyStatsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  registrationsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  friendsAddedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  groupsCreatedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  messagesSentCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Create compound index for efficient querying
dailyStatsSchema.index({ user: 1, date: -1 });

// Static method to increment stats
dailyStatsSchema.statics.incrementStats = async function(userId, type, count = 1) {
  // Get current time in Bangkok timezone (UTC+7)
  const now = new Date();
  const bangkokOffset = 7 * 60; // Bangkok is UTC+7 in minutes
  const localOffset = now.getTimezoneOffset(); // Get local timezone offset
  const bangkokTime = new Date(now.getTime() + (bangkokOffset + localOffset) * 60000);
  
  // Set to midnight of Bangkok day
  const today = new Date(bangkokTime.getFullYear(), bangkokTime.getMonth(), bangkokTime.getDate(), 0, 0, 0, 0);
  
  const updateField = {};
  switch (type) {
    case 'registration':
      updateField.registrationsCount = count;
      break;
    case 'friend':
      updateField.friendsAddedCount = count;
      break;
    case 'group':
      updateField.groupsCreatedCount = count;
      break;
    case 'message':
      updateField.messagesSentCount = count;
      break;
    default:
      throw new Error('Invalid stats type');
  }
  
  return await this.findOneAndUpdate(
    { user: userId, date: today },
    { $inc: updateField },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('DailyStats', dailyStatsSchema);

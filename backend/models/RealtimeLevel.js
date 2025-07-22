const mongoose = require('mongoose');
const RealtimeLevelSchema = new mongoose.Schema({
  db: Number,
  normalized: Number,
  rms: Number,
  avgFreq: Number,
  feature: Number,
  anomalyScore: Number,
  timestamp: {
    type: Date,
    default: Date.now
  },
  meta: {
    mic: String
  }
});

module.exports = mongoose.model('SoundLevelRealtime', RealtimeLevelSchema, 'SoundLevelRealtime');

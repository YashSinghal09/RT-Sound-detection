// backend/model.js
const mongoose = require('mongoose');

const SoundLevelSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  db: Number,
  normalized: Number,
});

module.exports = mongoose.model('SoundLevel', SoundLevelSchema);

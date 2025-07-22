const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: String,
  data: Buffer,
});

module.exports = mongoose.model('alertAudio', schema);

const mongoose = require('mongoose');

const ThresholdSchema = new mongoose.Schema({
  value: { type: Number, required: true, default: 70 }
});

module.exports = mongoose.model('Threshold', ThresholdSchema); 
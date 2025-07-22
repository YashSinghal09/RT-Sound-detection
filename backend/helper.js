// helper.js
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const alertAudio = require('./models/alertAudio');
const connectDB = require('./db');

async function run() {
  await connectDB();

  const audioPath = path.join(__dirname, 'alert.mp3');
  const audioBuffer = fs.readFileSync(audioPath);

  const doc = new alertAudio({
    name: 'alert.mp3',
    data: audioBuffer,
  });

  await doc.save();
  console.log('✅ Audio inserted successfully');

  mongoose.connection.close();
}

run();

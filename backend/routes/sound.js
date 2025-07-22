const express = require('express');
const { Parser } = require('json2csv');
const SoundLevel = require('../models/model');
const SoundLevelRealtime = require('../models/RealtimeLevel');
const alertAudio = require('../models/alertAudio');
const Threshold = require('../models/Threshold');
const router = express.Router();

// JWT middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'changeme_secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Admin-only middleware
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// GET/POST /threshold (admin only for POST)
router.get('/threshold', async (req, res) => {
  let thresholdDoc = await Threshold.findOne();
  if (!thresholdDoc) {
    thresholdDoc = await Threshold.create({ value: 70 });
  }
  res.json({ threshold: thresholdDoc.value });
});
router.post('/threshold', adminOnly, async (req, res) => {
  const { threshold } = req.body;
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
    return res.status(400).json({ error: 'Invalid threshold' });
  }
  let thresholdDoc = await Threshold.findOne();
  if (!thresholdDoc) {
    thresholdDoc = await Threshold.create({ value: threshold });
  } else {
    thresholdDoc.value = threshold;
    await thresholdDoc.save();
  }
  // Emit to all clients
  req.app.get('io').emit('threshold-update', { threshold });
  res.json({ threshold });
});

// DELETE all logs (admin only)
router.delete('/volume', adminOnly, async (req, res) => {
  try {
    await SoundLevel.deleteMany({});
    await SoundLevelRealtime.deleteMany({});
    res.status(200).json({ message: 'All logs deleted' });
    req.app.get('io').emit('clear-data');
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete logs' });
  }
});

// POST /volume
router.post('/volume', async (req, res) => {
  try {
    const { db, normalized } = req.body;
    const entry = new SoundLevel({ db, normalized });
    const saved = await entry.save();
    const audioDoc = await alertAudio.findOne({});
    const base64mp3 = audioDoc?.data?.toString('base64') || null;
    req.app.get('io').emit('new-data', saved);
    req.app.get('io').emit('warning', {
      message: 'Loud noise detected!',
      normalized,
      db,
      mp3: base64mp3
    });
    res.status(201).json({ message: 'Saved successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /realtime-volume
router.post('/realtime-volume', async (req, res) => {
  try {
    const { db, normalized, rms, avgFreq, feature, anomalyScore } = req.body;
    const entry = new SoundLevelRealtime({ db, normalized, rms, avgFreq, feature, anomalyScore });
    const saved = await entry.save();
    req.app.get('io').emit('realtime-data', saved);
   // req.app.get('io').emit('new-data', saved);
    res.status(201).json({ message: 'Realtime log saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error (realtime)' });
  }
});

// GET /data
router.get('/data', async (req, res) => {
  try {
    const allData = await SoundLevel.find().sort({ timestamp: 1 });
    res.json(allData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch data' });
  }
});

// GET /realtime-data
router.get('/realtime-data', async (req, res) => {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentData = await SoundLevelRealtime.find({ timestamp: { $gte: oneMinuteAgo } }).sort({ timestamp: 1 });
    res.json(recentData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch realtime data' });
  }
});

// Helper to get start of day/week
function getStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// GET /peaks
router.get('/peaks', async (req, res) => {
  try {
    const now = new Date();
    const startToday = getStartOfDay(now);
    const startYesterday = new Date(startToday.getTime() - 24 * 60 * 60 * 1000);
    const startWeek = getStartOfWeek(now);
    const peakToday = await SoundLevelRealtime.findOne({ timestamp: { $gte: startToday } }).sort({ normalized: -1 });
    const peakYesterday = await SoundLevelRealtime.findOne({ timestamp: { $gte: startYesterday, $lt: startToday } }).sort({ normalized: -1 });
    const peakWeek = await SoundLevelRealtime.findOne({ timestamp: { $gte: startWeek } }).sort({ normalized: -1 });
    res.json({
      today: peakToday ? peakToday.normalized : null,
      yesterday: peakYesterday ? peakYesterday.normalized : null,
      week: peakWeek ? peakWeek.normalized : null
    });
  } catch (err) {
    console.error('Peak endpoint error:', err);
    res.status(500).json({ error: 'Error fetching peak values' });
  }
});

// GET /frequency
router.get('/frequency', async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || 70;
    const now = new Date();
    const startToday = getStartOfDay(now);
    const startYesterday = new Date(startToday.getTime() - 24 * 60 * 60 * 1000);
    const startWeek = getStartOfWeek(now);
    const freqToday = await SoundLevel.countDocuments({ timestamp: { $gte: startToday }, normalized: { $gte: threshold } });
    const freqYesterday = await SoundLevel.countDocuments({ timestamp: { $gte: startYesterday, $lt: startToday }, normalized: { $gte: threshold } });
    const freqWeek = await SoundLevel.countDocuments({ timestamp: { $gte: startWeek }, normalized: { $gte: threshold } });
    res.json({
      today: freqToday,
      yesterday: freqYesterday,
      week: freqWeek
    });
  } catch (err) {
    console.error('Frequency endpoint error:', err);
    res.status(500).json({ error: 'Error fetching frequency values' });
  }
});

// GET /time-stats
router.get('/time-stats', async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || 70;
    const now = new Date();
    const startToday = getStartOfDay(now);
    const startYesterday = new Date(startToday.getTime() - 24 * 60 * 60 * 1000);
    const startWeek = getStartOfWeek(now);
    async function computeTimeStats(start, end) {
      const query = { timestamp: { $gte: start } };
      if (end) query.timestamp.$lt = end;
      const docs = await SoundLevelRealtime.find(query).sort({ timestamp: 1 }).lean();
      let lastState = null;
      let lastTime = null;
      let normalTime = 0;
      let noisyTime = 0;
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const state = doc.normalized >= threshold ? 'noisy' : 'normal';
        if (lastState !== null && lastTime !== null) {
          const dt = new Date(doc.timestamp) - new Date(lastTime);
          if (lastState === 'noisy') noisyTime += dt;
          else normalTime += dt;
        }
        lastState = state;
        lastTime = doc.timestamp;
      }
      return { normal: normalTime, noisy: noisyTime };
    }
    const todayStats = await computeTimeStats(startToday);
    const yesterdayStats = await computeTimeStats(startYesterday, startToday);
    const weekStats = await computeTimeStats(startWeek);
    res.json({
      today: todayStats,
      yesterday: yesterdayStats,
      week: weekStats
    });
  } catch (err) {
    console.error('Time-stats endpoint error:', err);
    res.status(500).json({ error: 'Error fetching time stats' });
  }
});

module.exports = router; 
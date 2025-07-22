const express = require('express');
const { Parser } = require('json2csv');
const SoundLevelRealtime = require('../models/RealtimeLevel');
const path = require('path');
const fs = require('fs');
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

router.use(authMiddleware);

// GET /generate-report
router.get('/generate-report', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate && endDate) {
      filter.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    const data = await SoundLevelRealtime.find(filter).lean();
    const fields = ['timestamp', 'normalized', 'db','avgFreq','rms','anomalyScore'];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(data);
    const filePath = path.join(__dirname, '../../reports/report.csv');
    fs.writeFileSync(filePath, csv);
    res.download(filePath, 'sound_report.csv');
  } catch (err) {
    console.error('CSV generation error:', err);
    res.status(500).send('Error generating CSV');
  }
});

module.exports = router; 
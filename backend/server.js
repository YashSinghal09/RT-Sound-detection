// backend/server.js
const express = require('express');
const http = require('http');
const { Parser } = require('json2csv');
const fs = require('fs');

const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const connectDB = require('./db');
const SoundLevel = require('./models/model');
const alertAudio = require('./models/alertAudio'); // create this model if not yet created
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const JWT_SECRET = process.env.JWT_SECRET;

// Route imports
const authRoutes = require('./routes/auth');
const soundRoutes = require('./routes/sound');
const reportRoutes = require('./routes/report');


const app = express();
const server = http.createServer(app); // Wrap app with http
const io = require('socket.io')(server, {
  cors: {
      origin: '*', // allow all for dev
      methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 5000;

connectDB();



mongoose.connection.once('open', async () => {
    const db = mongoose.connection.db;
    
    const collections = await db.listCollections().toArray();
    const exists = collections.some(c => c.name === 'SoundLevelRealtime');
    
    if (!exists) {
        await db.createCollection('SoundLevelRealtime', {
            timeseries: {
                timeField: 'timestamp',  // Field used to track time
                metaField: 'meta',       // Optional: metadata field (e.g. mic name)
                granularity: 'seconds'
            },
            expireAfterSeconds: 86400 // Optional: auto-delete data older than 1 day
        });
        
        console.log('✅ Time Series Collection created: SoundLevelRealtime');
    }
});

const SoundLevelRealtime = require('./models/RealtimeLevel');
app.use(cors());
app.use(express.json());

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- Socket.io Connection ---
io.on('connection', (socket) => {
  console.log('🟢 A client connected');

  socket.on('disconnect', () => {
    console.log('🔴 A client disconnected');
  });
});

app.set('io', io);

// JWT authentication middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Protect all API routes except login/register and static files
const openRoutes = ['/api/login', '/api/register'];
app.use((req, res, next) => {
  if (
    req.method === 'GET' && req.path.startsWith('/api/') && !openRoutes.includes(req.path)
    || req.method === 'POST' && req.path.startsWith('/api/') && !openRoutes.includes(req.path)
  ) {
    return authMiddleware(req, res, next);
  }
  next();
});

// Mount routes
app.use('/api', authRoutes);
app.use('/api', soundRoutes);
app.use('/api', reportRoutes);


server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

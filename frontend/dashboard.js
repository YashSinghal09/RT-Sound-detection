// Global time variables (in ms)
const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;
const ONE_WEEK = 7 * ONE_DAY;

// You can change these as needed
window.TIME_TODAY = ONE_DAY;
window.TIME_YESTERDAY = ONE_DAY;
window.TIME_WEEK = ONE_WEEK;
window.NOISE_THRESHOLD = 70; // dB or normalized, adjust as needed

const socket = io();

// State
let lastNoiseTimestamp = null;
let lastNoiseDuration = 0;
let lastStatus = 'Normal';
let lastStatusChange = Date.now();
let normalStart = Date.now();
let noisyStart = null;
let timeNormal = 0;
let timeNoisy = 0;

// Utility
function formatDuration(ms) {
  if (ms < 1000) return ms + ' ms';
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / (60 * 1000)) % 60;
  const h = Math.floor(ms / (60 * 60 * 1000));
  return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`;
}

function updateCurrentStatus(status) {
  document.getElementById('currentStatus').textContent = status;
  const duration = Date.now() - lastStatusChange;
  document.getElementById('currentStatusDuration').textContent = `for ${formatDuration(duration)}`;
}

function updateLastNoise(time, duration) {
  document.getElementById('lastNoiseTime').textContent = time ? new Date(time).toLocaleString() : '--';
  document.getElementById('lastNoiseDuration').textContent = duration ? formatDuration(duration) : '--';
}

function updateTimeCards() {
  document.getElementById('timeNormal').textContent = formatDuration(timeNormal);
  document.getElementById('timeNoisy').textContent = formatDuration(timeNoisy);
}

// Require JWT authentication for dashboard
const jwt = localStorage.getItem('jwt');
if (!jwt) {
  window.location.href = 'login.html';
}

// Helper for authenticated fetch
function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Authorization'] = 'Bearer ' + jwt;
  return fetch(url, options);
}

// Fetch peak and frequency data from backend
async function fetchStats() {
  // Fetch peaks
  authFetch(`/api/peaks`)
    .then(res => res.json())
    .then(data => {
      document.getElementById('peakToday').textContent = data.today !== null ? data.today : '--';
      document.getElementById('peakYesterday').textContent = data.yesterday !== null ? data.yesterday : '--';
      document.getElementById('peakWeek').textContent = data.week !== null ? data.week : '--';
    });
  // Fetch frequency
  authFetch(`/api/frequency?threshold=${window.NOISE_THRESHOLD}`)
    .then(res => res.json())
    .then(data => {
      document.getElementById('freqToday').textContent = data.today !== undefined ? data.today : '--';
      document.getElementById('freqYesterday').textContent = data.yesterday !== undefined ? data.yesterday : '--';
      document.getElementById('freqWeek').textContent = data.week !== undefined ? data.week : '--';
    });
  // Fetch time stats
  authFetch(`/api/time-stats?threshold=${window.NOISE_THRESHOLD}`)
    .then(res => res.json())
    .then(data => {
      if (data.today) {
        document.getElementById('timeNormal').textContent = formatDuration(data.today.normal);
        document.getElementById('timeNoisy').textContent = formatDuration(data.today.noisy);
      }
    });
}

// Real-time update logic
socket.on('realtime-data', (data) => {
  // Real-time mic volume update
  if (data.db !== undefined) {
    document.getElementById('dbValue').textContent = `${data.db} dB`;
  }
  if (data.normalized !== undefined) {
    document.getElementById('normalizedValue').textContent = data.normalized;
    // Show warning if above threshold
    if (data.normalized >= window.NOISE_THRESHOLD) {
      document.getElementById('warning').style.display = '';
    } else {
      document.getElementById('warning').style.display = 'none';
    }
  }
  const { db, normalized, timestamp } = data;
  const now = Date.now();
  const isNoisy = normalized >= window.NOISE_THRESHOLD;

  if (isNoisy && lastStatus !== 'Noisy') {
    lastStatus = 'Noisy';
    lastStatusChange = now;
    noisyStart = now;
    if (normalStart) timeNormal += now - normalStart;
    updateCurrentStatus('Noisy');
  } else if (!isNoisy && lastStatus !== 'Normal') {
    lastStatus = 'Normal';
    lastStatusChange = now;
    normalStart = now;
    if (noisyStart) timeNoisy += now - noisyStart;
    updateCurrentStatus('Normal');
  }
  if(isNoisy && lastStatus === 'Noisy') updateCurrentStatus('Noisy');
  if(!isNoisy && lastStatus === 'Normal') updateCurrentStatus('Normal');

  if (isNoisy) {
    if (!lastNoiseTimestamp || now - lastNoiseTimestamp > ONE_MINUTE) {
      lastNoiseTimestamp = now;
      lastNoiseDuration = 0;
    } else {
      lastNoiseDuration = now - lastNoiseTimestamp;
    }
    updateLastNoise(lastNoiseTimestamp, lastNoiseDuration);
  }

  updateTimeCards();
  fetchStats(); // Fetch and update all dashboard values in real time
});

// Microphone logic from script.js
async function startMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    const dataArray = new Float32Array(analyser.fftSize);
    source.connect(analyser);

    const dbDisplay = document.getElementById('dbValue');
    const normDisplay = document.getElementById('normalizedValue');
    const warningDiv = document.getElementById('warning');
    let lastTriggered = 0;
    let lastSendTime = 0;

    function calculateDb() {
      const now = Date.now();
      analyser.getFloatTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i];
      }
      // RMS
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const db = 20 * Math.log10(rms);
      const dbFixed = rms > 0.00001 ? db.toFixed(2) : '-∞';
      let normalized = rms > 0.00001 ? (Math.min(Math.max((db + 60) * 2, 0), 100)) : 0;
      normalized = Math.round(normalized);
      dbDisplay.textContent = `${dbFixed} dB`;
      normDisplay.textContent = `${normalized}`;
      // Frequency data
      const freqArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqArray);
      const avgFreq = freqArray.reduce((a, b) => a + b, 0) / freqArray.length;
      // Placeholder acoustic feature
      const feature = avgFreq;
      // Anomaly scoring logic
      const anomalyScore = normalized > window.NOISE_THRESHOLD ? 200 : 50;
      if (now - lastSendTime > 250) {
        lastSendTime = now;
        authFetch('/api/realtime-volume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ db, normalized, rms, avgFreq, feature, anomalyScore }),
        }).catch(console.error);
      }
      if (normalized >= window.NOISE_THRESHOLD && now - lastTriggered > 10000) {
        lastTriggered = now;
        // Emit warning to self
        socket.emit('warning', { message: 'Loud noise detected!', normalized, db });
        // Show local UI warning
        warningDiv.style.display = 'block';
        setTimeout(() => {
          warningDiv.style.display = 'none';
        }, 3000);
        // Send to backend
        authFetch('/api/volume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ db, normalized }),
        }).catch(console.error);
      }
      requestAnimationFrame(calculateDb);
    }
    calculateDb();
  } catch (err) {
    alert('Microphone access denied.');
    console.error(err);
  }
}

// Listen to backend-emitted warning (with audio)
socket.on('warning', (data) => {
  console.log('⚠️ Server warning:', data.message);
  if (data.mp3) {
    const audio = new Audio(`data:audio/mp3;base64,${data.mp3}`);
    audio.play().catch(err => console.error('⚠️ Audio play error:', err));
  }
  // Optional UI indicator
  const warningDiv = document.getElementById('warning');
  if (warningDiv) {
    warningDiv.style.display = 'block';
    setTimeout(() => {
      warningDiv.style.display = 'none';
    }, 3000);
  }
});

// Start mic on page load
startMic();

// Delete logs button logic
const deleteBtn = document.getElementById('deleteLogsBtn');
if (deleteBtn) {
  deleteBtn.onclick = async () => {
    deleteBtn.disabled = true;
    document.getElementById('deleteStatus').textContent = 'Deleting...';
    try {
      authFetch('/api/volume', { method: 'DELETE' })
        .then(res => {
          if (res.ok) {
            document.getElementById('deleteStatus').textContent = 'All logs deleted!';
            setTimeout(() => document.getElementById('deleteStatus').textContent = '', 2000);
          } else {
            document.getElementById('deleteStatus').textContent = 'Failed to delete logs.';
          }
        })
        .catch(e => {
          document.getElementById('deleteStatus').textContent = 'Error deleting logs.';
        });
    } catch (e) {
      document.getElementById('deleteStatus').textContent = 'Error deleting logs.';
    }
    deleteBtn.disabled = false;
  };
}

// Threshold control logic
const thresholdInput = document.getElementById('thresholdInput');
const thresholdNumber = document.getElementById('thresholdNumber');

function setThreshold(val) {
  window.NOISE_THRESHOLD = Number(val);
  thresholdInput.value = val;
  thresholdNumber.value = val;
  fetchStats(); // Update dashboard stats with new threshold
}

if (thresholdInput && thresholdNumber) {
  thresholdInput.addEventListener('input', (e) => setThreshold(e.target.value));
  thresholdNumber.addEventListener('input', (e) => setThreshold(e.target.value));
}

// Initialize threshold from input value
setThreshold(thresholdInput ? thresholdInput.value : 70);

// Initial fetch
fetchStats();
updateCurrentStatus(lastStatus);
updateLastNoise(lastNoiseTimestamp, lastNoiseDuration);
updateTimeCards();

// Optionally, poll for stats every X seconds
setInterval(fetchStats, 60 * 1000);

// Logout button logic
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.onclick = () => {
    localStorage.removeItem('jwt');
    window.location.href = 'login.html';
  };
}

// Parse JWT to get user role
function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return {};
  }
}
const user = parseJwt(jwt);
const isAdmin = user.role === 'admin';

// Hide threshold controls and delete logs button for non-admins
window.addEventListener('DOMContentLoaded', () => {
  if (!isAdmin) {
    const thresholdControls = document.querySelector('.dashboard-controls');
    if (thresholdControls) thresholdControls.style.display = 'none';
    const deleteBtn = document.getElementById('deleteLogsBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';
  }
});

// Fetch threshold from backend and update slider
async function fetchAndSetThreshold() {
  authFetch('/api/threshold')
    .then(res => res.json())
    .then(data => {
      if (typeof data.threshold === 'number') {
        setThreshold(data.threshold);
      }
    });
}

// Listen for threshold updates from server
const socket2 = io();
socket2.on('threshold-update', (data) => {
  if (typeof data.threshold === 'number') {
    setThreshold(data.threshold);
  }
});

// When admin changes threshold, POST to backend
if (isAdmin && thresholdInput && thresholdNumber) {
  thresholdInput.addEventListener('change', (e) => {
    authFetch('/api/threshold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold: Number(e.target.value) })
    });
  });
  thresholdNumber.addEventListener('change', (e) => {
    authFetch('/api/threshold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold: Number(e.target.value) })
    });
  });
}

// On page load, fetch threshold
fetchAndSetThreshold(); 
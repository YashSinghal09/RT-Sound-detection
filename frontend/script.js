const socket = io(); // Auto-connects to same origin
const deleteBtn = document.getElementById('deleteLogsBtn');
const statusDiv = document.getElementById('deleteStatus');
const THRESHOLD = 70;
let lastTriggered = 0;
let lastSendTime = 0;

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
    
    function calculateDb() {
        const now = Date.now();
        analyser.getFloatTimeDomainData(dataArray);
        
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sumSquares += dataArray[i] * dataArray[i];
        }
        // RMS
        const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length);
        
        const db = 20 * Math.log10(rms);
        const dbFixed = rms > 0.00001 ? db.toFixed(2) : '-∞';
        
        let normalized = rms > 0.00001 ? (Math.min(Math.max((db + 60) * 2, 0), 100)) : 0;
        normalized = Math.round(normalized);
        
        dbDisplay.textContent = `${dbFixed} dB`;
        normDisplay.textContent = `${normalized}`;
        
        // Event trigger if normalized exceeds threshold
        // Frequency data
        const freqArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqArray);
        const avgFreq = freqArray.reduce((a, b) => a + b, 0) / freqArray.length;
        
        
        // Placeholder acoustic feature
        const feature = avgFreq;
        
        // Anomaly scoring logic
        const anomalyScore = normalized > 60 ? 200 : 50;
        
        if (now - lastSendTime > 250) {
       lastSendTime = now;
       fetch('/api/realtime-volume', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ db, normalized, rms, avgFreq, feature, anomalyScore }),
        }).catch(console.error);
      }
    
      
      if (normalized >= THRESHOLD && now - lastTriggered > 10000) {
        lastTriggered = now;

        // Emit warning to self
        socket.emit('warning', { message: 'Loud noise detected!', normalized, db });

        // Show local UI warning
        warningDiv.style.display = 'block';
        setTimeout(() => {
          warningDiv.style.display = 'none';
        }, 3000);

        // Send to backend
        console.log('Posting to backend:', { db, normalized });
        fetch('/api/volume', {
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


deleteBtn.addEventListener('click', () => {
  if (!confirm("Are you sure you want to delete all logs?")) return;

  fetch('/api/volume', {
    method: 'DELETE',
  })
  .then(res => res.json())
  .then(data => {
    console.log('✅ Logs deleted:', data);
    statusDiv.textContent = 'All logs deleted successfully.';
    setTimeout(() => (statusDiv.textContent = ''), 3000);
  })
  .catch(err => {
    console.error('❌ Failed to delete logs:', err);
    statusDiv.textContent = 'Error deleting logs.';
    statusDiv.style.color = 'red';
  });
});

//Optional: listen to backend-emitted warning (if needed)
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

startMic();

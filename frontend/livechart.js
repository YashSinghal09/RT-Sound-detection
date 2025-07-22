// JWT authentication for livechart
const jwt = localStorage.getItem('jwt');
if (!jwt) {
  window.location.href = 'login.html';
}
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.onclick = () => {
    localStorage.removeItem('jwt');
    window.location.href = 'login.html';
  };
}

function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Authorization'] = 'Bearer ' + jwt;
  return fetch(url, options);
}

const socket = io();

// Reusable chart creation function
function createChart(id, label, color) {
  const ctx = document.getElementById(id).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        borderWidth: 1,
        fill: false,
        tension: 0.2,
        pointRadius: 0,
      }]
    },
    options: {
  responsive: true,
  animation: false,
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false
  },
  plugins: {
    zoom: {
      pan: {
        enabled: true,
        mode: 'x',
      },
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true
        },
        mode: 'x',
      }
    },
    tooltip: {
      enabled: true,
      mode: 'index',
      intersect: false
    }
  },
  scales: {
    x: {
      type: 'time',
      time: { unit: 'second' },
      title: { display: true, text: 'Time' }
    },
    y: {
      beginAtZero: true,
      title: { display: true, text: label }
    }
  }
}

  });
}

// Create charts
const chartNormalized = createChart('chartNormalized', 'Normalized Volume (%)', '#4285F4');
//const chartRMS        = createChart('chartRMS',        'RMS Amplitude',         '#DB4437');
const chartFreq       = createChart('chartFreq',       'Average Frequency',     '#F4B400');
const chartFeature    = createChart('chartFeature',    'Acoustic Feature',      '#0F9D58');
const chartAnomaly    = createChart('chartAnomaly',    'Anomaly Score',         '#9C27B0');

// Helper to push data to a chart
function pushData(chart, timestamp, value) {
  chart.data.labels.push(new Date(timestamp));
  chart.data.datasets[0].data.push(value);

  // Keep last 100 points
 const oneMinuteAgo = Date.now() - 60 * 1000;

while (chart.data.labels.length && chart.data.labels[0] < oneMinuteAgo) {
  chart.data.labels.shift();
  chart.data.datasets[0].data.shift();
}

  chart.update();
}

  document.getElementById('downloadCsvBtn').addEventListener('click', () => {
    const startInput = document.getElementById('startDate').value;
    const endInput = document.getElementById('endDate').value;

    if (!startInput || !endInput) {
      alert('Please select both start and end dates.');
      return;
    }

    const startDate = new Date(startInput).toISOString();
    const endDate = new Date(endInput).toISOString();

    // Redirect to download CSV
    window.location.href = `/api/generate-report?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  });



// Fetch initial data
authFetch('/api/realtime-data')
  .then(res => res.json())
  .then(data => {
    data.forEach(entry => {
      const t = entry.timestamp;
      pushData(chartNormalized, t, entry.normalized);
      //pushData(chartRMS, t, entry.rms);
      pushData(chartFreq, t, entry.avgFreq);
      pushData(chartFeature, t, entry.feature);
      pushData(chartAnomaly, t, entry.anomalyScore);
    });
  });

  function resetAllZoom() {
  chartNormalized.resetZoom();
  //chartRMS.resetZoom();
  chartFreq.resetZoom();
  chartFeature.resetZoom();
  chartAnomaly.resetZoom();
}


// Live updates from server
socket.on('realtime-data', (data) => {
  pushData(chartNormalized, data.timestamp, data.normalized);
  pushData(chartFreq, data.timestamp, data.avgFreq);
  pushData(chartFeature, data.timestamp, data.feature);
  pushData(chartAnomaly, data.timestamp, data.anomalyScore);
});

// Clear event
socket.on('clear-data', () => {
  [ chartNormalized, chartFreq, chartFeature, chartAnomaly].forEach(chart => {
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
  });
});

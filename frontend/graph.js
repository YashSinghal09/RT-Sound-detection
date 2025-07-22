// JWT authentication for graph
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

// Setup Chart.js
const ctx = document.getElementById('volumeChart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [], // timestamps
    datasets: [{
      label: 'Normalized Volume (%)',
      data: [],
      borderColor: 'rgba(255, 99, 132, 1)',
      borderWidth: 2,
      fill: false,
      tension: 0.2,
    }]
  },
  options: {
    responsive: true,
    animation: false,
    scales: {
      x: {
        type: 'time',
        time: { unit: 'second' },
        title: { display: true, text: 'Time' }
      },
      y: {
        min: 0,
        max: 100,
        title: { display: true, text: 'Normalized Volume (%)' }
      }
    }
  }
});

// Fetch historical data once
authFetch('/api/data')
  .then(res => res.json())
  .then(data => {
    data.forEach(entry => {
      chart.data.labels.push(new Date(entry.timestamp));
      chart.data.datasets[0].data.push(entry.normalized);
    });
    chart.update();
  })
  .catch(console.error);

// Listen for "clear-data" event to reset the chart
socket.on('clear-data', () => {
  console.log('🧼 Received clear-data event');

  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.update();
});


// Listen for real-time updates
socket.on('new-data', (data) => {
  chart.data.labels.push(new Date(data.timestamp));
  chart.data.datasets[0].data.push(data.normalized);
  // Optionally keep only the last N points
  if (chart.data.labels.length > 100) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
});

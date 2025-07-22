document.getElementById('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const asAdmin = document.getElementById('loginAsAdmin').checked;
  const errorDiv = document.getElementById('loginError');
  errorDiv.textContent = '';
  try {
    const body = { username, password };
    if (asAdmin) body.role = 'admin';
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('jwt', data.token);
      window.location.href = 'dashboard.html';
    } else {
      errorDiv.textContent = data.error || 'Login failed';
    }
  } catch (err) {
    errorDiv.textContent = 'Network error';
  }
}; 
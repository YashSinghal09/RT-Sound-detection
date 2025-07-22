document.getElementById('registerForm').onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value;
  const password = document.getElementById('registerPassword').value;
  const asAdmin = document.getElementById('registerAsAdmin').checked;
  const errorDiv = document.getElementById('registerError');
  errorDiv.textContent = '';
  try {
    const body = { username, password };
    if (asAdmin) body.role = 'admin';
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      window.location.href = 'login.html';
    } else {
      errorDiv.textContent = data.error || 'Registration failed';
    }
  } catch (err) {
    errorDiv.textContent = 'Network error';
  }
}; 
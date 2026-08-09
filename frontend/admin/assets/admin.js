// admin.js
const API_URL = 'http://localhost:5000/api';

const token = localStorage.getItem('admin_token');
const user = JSON.parse(localStorage.getItem('admin_user'));

// ── Shared UI ──────────────────────────────────────────────────────────────

if (document.getElementById('logoutBtn')) {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    window.location.href = 'index.html';
  });
  
  if (user) {
    document.getElementById('adminInfo').innerHTML = `
      <strong>${user.name}</strong><br>
      ${user.role}
    `;
  }
}

// ── Auth Logic (index.html) ────────────────────────────────────────────────

if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('errorMsg');
    errorEl.style.display = 'none';
    
    const body = {
      orgSlug: document.getElementById('orgSlug').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value
    };

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message);
      if (data.data.user.role !== 'ADMIN') throw new Error('Access denied. Admins only.');
      
      localStorage.setItem('admin_token', data.data.accessToken);
      localStorage.setItem('admin_user', JSON.stringify(data.data.user));
      window.location.href = 'dashboard.html';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// ── Dashboard Logic (dashboard.html) ───────────────────────────────────────

if (document.getElementById('statTotal')) {
  if (!token) window.location.href = 'index.html';

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const { data } = await res.json();
      if (data) {
        document.getElementById('statTotal').textContent = data.total;
        document.getElementById('statCompleted').textContent = data.completed;
        document.getElementById('statWaiting').textContent = data.waiting;
        document.getElementById('statMissed').textContent = data.noShow + data.expired;
      }
    } catch(e) { console.error(e); }
  };

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const { data } = await res.json();
      if (data) {
        document.getElementById('cfgBookingOpen').value = data.bookingOpenTime;
        document.getElementById('cfgBookingClose').value = data.bookingCloseTime;
        document.getElementById('cfgServiceStart').value = data.serviceStartTime;
        document.getElementById('cfgServiceEnd').value = data.serviceEndTime;
        document.getElementById('cfgExpiryMins').value = data.reservationExpiryMinutes;
      }
    } catch(e) { console.error(e); }
  };

  document.getElementById('configForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('cfgMsg');
    msg.style.color = 'var(--text-secondary)';
    msg.textContent = 'Saving...';

    const body = {
      bookingOpenTime: document.getElementById('cfgBookingOpen').value,
      bookingCloseTime: document.getElementById('cfgBookingClose').value,
      serviceStartTime: document.getElementById('cfgServiceStart').value,
      serviceEndTime: document.getElementById('cfgServiceEnd').value,
      reservationExpiryMinutes: parseInt(document.getElementById('cfgExpiryMins').value, 10),
    };

    try {
      const res = await fetch(`${API_URL}/admin/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).message);
      msg.style.color = '#16a34a';
      msg.textContent = 'Configuration updated successfully.';
      setTimeout(() => msg.textContent = '', 3000);
    } catch(err) {
      msg.style.color = '#dc2626';
      msg.textContent = err.message;
    }
  });

  loadStats();
  loadConfig();
}

// ── Services Logic (services.html) ─────────────────────────────────────────

if (document.getElementById('servicesTableBody')) {
  if (!token) window.location.href = 'index.html';

  const loadServices = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/services`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const { data } = await res.json();
      const tbody = document.getElementById('servicesTableBody');
      tbody.innerHTML = '';
      
      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No services found</td></tr>';
        return;
      }

      data.forEach(s => {
        tbody.innerHTML += `
          <tr>
            <td style="font-weight:500;">${s.name}</td>
            <td>${s.avgServiceTimeMinutes}</td>
            <td>${s.dailyCapacity}</td>
            <td><code>${s.tokenPrefix}</code></td>
          </tr>
        `;
      });
    } catch(e) { console.error(e); }
  };

  document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('svcMsg');
    
    const body = {
      name: document.getElementById('svcName').value,
      tokenPrefix: document.getElementById('svcPrefix').value.toUpperCase(),
      avgServiceTimeMinutes: parseInt(document.getElementById('svcTime').value, 10),
      dailyCapacity: parseInt(document.getElementById('svcCap').value, 10)
    };

    try {
      const res = await fetch(`${API_URL}/admin/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).message);
      
      msg.style.color = '#16a34a';
      msg.textContent = 'Service created.';
      document.getElementById('addServiceForm').reset();
      loadServices();
      setTimeout(() => msg.textContent = '', 3000);
    } catch(err) {
      msg.style.color = '#dc2626';
      msg.textContent = err.message;
    }
  });

  loadServices();
}

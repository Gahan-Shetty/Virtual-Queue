// admin.js

const API_URL = 'http://localhost:5000/api';

const token = localStorage.getItem('admin_token');
const user = JSON.parse(localStorage.getItem('admin_user'));

// ── Shared UI ──────────────────────────────────────────────────────────────

const logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    window.location.href = 'index.html';
  });
}

const adminInfo = document.getElementById('adminInfo');

if (adminInfo && user) {
  adminInfo.innerHTML = `
    <strong>${user.name}</strong><br>
    ${user.role}
  `;
}

// ── Auth Logic (index.html) ────────────────────────────────────────────────

const loginForm = document.getElementById('loginForm');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message);
      }

      if (data.data.user.role !== 'ADMIN') {
        throw new Error('Access denied. Admins only.');
      }

      localStorage.setItem(
        'admin_token',
        data.data.accessToken
      );

      localStorage.setItem(
        'admin_user',
        JSON.stringify(data.data.user)
      );

      window.location.href = 'dashboard.html';

    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// ── Dashboard Logic ───────────────────────────────────────────────────────

const statTotal = document.getElementById('statTotal');

if (statTotal) {
  if (!token) {
    window.location.href = 'index.html';
  }

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const { data } = await res.json();

      if (data) {
        document.getElementById('statTotal').textContent = data.total;
        document.getElementById('statCompleted').textContent = data.completed;
        document.getElementById('statWaiting').textContent = data.waiting;
        document.getElementById('statMissed').textContent =
          data.noShow + data.expired;
      }

    } catch (e) {
      console.error(e);
    }
  };

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/config`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const { data } = await res.json();

      if (data) {
        document.getElementById('cfgBookingOpen').value =
          data.bookingOpenTime;

        document.getElementById('cfgBookingClose').value =
          data.bookingCloseTime;

        document.getElementById('cfgServiceStart').value =
          data.serviceStartTime;

        document.getElementById('cfgServiceEnd').value =
          data.serviceEndTime;

        document.getElementById('cfgExpiryMins').value =
          data.reservationExpiryMinutes;
      }

    } catch (e) {
      console.error(e);
    }
  };

  const configForm = document.getElementById('configForm');

  if (configForm) {
    configForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const msg = document.getElementById('cfgMsg');

      msg.textContent = 'Saving...';

      const body = {
        bookingOpenTime:
          document.getElementById('cfgBookingOpen').value,

        bookingCloseTime:
          document.getElementById('cfgBookingClose').value,

        serviceStartTime:
          document.getElementById('cfgServiceStart').value,

        serviceEndTime:
          document.getElementById('cfgServiceEnd').value,

        reservationExpiryMinutes:
          parseInt(
            document.getElementById('cfgExpiryMins').value,
            10
          )
      };

      try {
        const res = await fetch(`${API_URL}/admin/config`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          throw new Error((await res.json()).message);
        }

        msg.textContent = 'Configuration updated successfully.';

        setTimeout(() => {
          msg.textContent = '';
        }, 3000);

      } catch (err) {
        msg.textContent = err.message;
      }
    });
  }

  loadStats();
  loadConfig();

  // Real-time: Live Socket.IO listener for dashboard stats updates
  if (typeof io !== 'undefined' && token) {
    try {
      const socket = io('http://localhost:5000/admin', {
        auth: { token }
      });
      socket.on('admin:stats_updated', () => loadStats());
      socket.on('admin:config_updated', () => loadConfig());
      socket.on('admin:token_allocated', () => loadStats());
      socket.on('admin:token_expired', () => loadStats());
    } catch (err) {
      console.error('Admin socket connection error:', err);
    }
  }
}

// ── Services Logic ────────────────────────────────────────────────────────

const servicesTableBody =
  document.getElementById('servicesTableBody');

if (servicesTableBody) {

  if (!token) {
    window.location.href = 'index.html';
  }

  const loadServices = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/services`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const { data } = await res.json();

      servicesTableBody.innerHTML = '';

      if (!data || data.length === 0) {
        servicesTableBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center;">
              No services found
            </td>
          </tr>
        `;
        return;
      }

      data.forEach((s) => {
        servicesTableBody.innerHTML += `
          <tr>
            <td style="font-weight:500;">
              ${s.name}
            </td>
            <td>${s.avgServiceTimeMinutes}</td>
            <td>${s.dailyCapacity}</td>
            <td>
              <code>${s.tokenPrefix}</code>
            </td>
          </tr>
        `;
      });

    } catch (e) {
      console.error(e);
    }
  };

  const addServiceForm =
    document.getElementById('addServiceForm');

  if (addServiceForm) {

    addServiceForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const msg = document.getElementById('svcMsg');

      const body = {
        name: document.getElementById('svcName').value,

        tokenPrefix:
          document.getElementById('svcPrefix')
            .value
            .toUpperCase(),

        avgServiceTimeMinutes:
          parseInt(
            document.getElementById('svcTime').value,
            10
          ),

        dailyCapacity:
          parseInt(
            document.getElementById('svcCap').value,
            10
          )
      };

      try {
        const res = await fetch(`${API_URL}/admin/services`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          throw new Error((await res.json()).message);
        }

        msg.textContent = 'Service created.';

        addServiceForm.reset();

        await loadServices();

        setTimeout(() => {
          msg.textContent = '';
        }, 3000);

      } catch (err) {
        msg.textContent = err.message;
      }
    });
  }

  loadServices();
}
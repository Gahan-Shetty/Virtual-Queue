// patient.js
const API_URL = 'http://localhost:5000/api';
let socket;

// Helper: UUID generator for Idempotency-Key
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// ── Auth Logic (index.html) ────────────────────────────────────────────────

if (document.getElementById('loginForm')) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginCard = document.getElementById('loginCard');
  const registerCard = document.getElementById('registerCard');

  document.getElementById('showRegister').addEventListener('click', (e) => {
    e.preventDefault();
    loginCard.style.display = 'none';
    registerCard.style.display = 'block';
  });

  document.getElementById('showLogin').addEventListener('click', (e) => {
    e.preventDefault();
    registerCard.style.display = 'none';
    loginCard.style.display = 'block';
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('loginError');
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
      
      localStorage.setItem('token', data.data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      window.location.href = 'dashboard.html';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('registerError');
    errorEl.style.display = 'none';
    
    const body = {
      orgSlug: document.getElementById('regOrgSlug').value,
      name: document.getElementById('regName').value,
      email: document.getElementById('regEmail').value,
      phone: document.getElementById('regPhone').value,
      password: document.getElementById('regPassword').value
    };

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message);
      
      localStorage.setItem('token', data.data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      window.location.href = 'dashboard.html'; // Usually needs OTP, bypassing for demo
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// ── Verification Helper ────────────────────────────────────────────────────

const setupVerificationFlow = (onSuccess) => {
  const verifyCard = document.getElementById('verifyAccountCard');
  if (!verifyCard) return;

  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const otpViaSelect = document.getElementById('otpViaSelect');
  const otpSendMsg = document.getElementById('otpSendMsg');
  const otpVerifyStep = document.getElementById('otpVerifyStep');
  const otpCodeInput = document.getElementById('otpCodeInput');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const otpVerifyError = document.getElementById('otpVerifyError');
  const otpVerifySuccess = document.getElementById('otpVerifySuccess');
  const resendOtpLink = document.getElementById('resendOtpLink');

  const token = localStorage.getItem('token');

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (otpSendMsg) {
      otpSendMsg.style.display = 'block';
      otpSendMsg.textContent = 'Sending OTP...';
      otpSendMsg.style.color = 'var(--status-waiting)';
    }
    if (sendOtpBtn) sendOtpBtn.disabled = true;

    try {
      const via = otpViaSelect ? otpViaSelect.value : 'email';
      const res = await fetch(`${API_URL}/auth/otp/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ via })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send OTP');

      if (otpSendMsg) {
        otpSendMsg.textContent = data.message || `OTP sent to your ${via}!`;
        otpSendMsg.style.color = 'var(--status-called)';
      }
      if (otpVerifyStep) otpVerifyStep.style.display = 'block';
    } catch (err) {
      if (otpSendMsg) {
        otpSendMsg.textContent = err.message;
        otpSendMsg.style.color = 'var(--status-no-show)';
      }
    } finally {
      if (sendOtpBtn) sendOtpBtn.disabled = false;
    }
  };

  if (sendOtpBtn) {
    sendOtpBtn.onclick = handleSendOtp;
  }

  if (resendOtpLink) {
    resendOtpLink.onclick = (e) => {
      e.preventDefault();
      handleSendOtp();
    };
  }

  if (verifyOtpBtn) {
    verifyOtpBtn.onclick = async (e) => {
      e.preventDefault();
      const code = otpCodeInput ? otpCodeInput.value.trim() : '';
      if (!code || code.length < 4) {
        if (otpVerifyError) {
          otpVerifyError.textContent = 'Please enter a 6-digit OTP code';
          otpVerifyError.style.display = 'block';
        }
        return;
      }

      if (otpVerifyError) otpVerifyError.style.display = 'none';
      if (otpVerifySuccess) otpVerifySuccess.style.display = 'none';
      verifyOtpBtn.disabled = true;

      try {
        const via = otpViaSelect ? otpViaSelect.value : 'email';
        const res = await fetch(`${API_URL}/auth/otp/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ otp: code, via })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Verification failed');

        // Update local user state & store new accessToken (which has isVerified: true in JWT payload)
        if (data.data) {
          if (data.data.accessToken) {
            localStorage.setItem('token', data.data.accessToken);
          }
          if (data.data.user) {
            localStorage.setItem('user', JSON.stringify(data.data.user));
          } else {
            let u = JSON.parse(localStorage.getItem('user') || '{}');
            u.isVerified = true;
            localStorage.setItem('user', JSON.stringify(u));
          }
        } else {
          let u = JSON.parse(localStorage.getItem('user') || '{}');
          u.isVerified = true;
          localStorage.setItem('user', JSON.stringify(u));
        }

        if (otpVerifySuccess) {
          otpVerifySuccess.textContent = 'Account verified successfully!';
          otpVerifySuccess.style.display = 'block';
        }

        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 1000);
      } catch (err) {
        if (otpVerifyError) {
          otpVerifyError.textContent = err.message;
          otpVerifyError.style.display = 'block';
        }
      } finally {
        verifyOtpBtn.disabled = false;
      }
    };
  }
};

// ── Dashboard Logic (dashboard.html) ───────────────────────────────────────

if (document.getElementById('tokenStatus')) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!token) window.location.href = 'index.html';
  
  if (user && user.name) {
    document.getElementById('patientName').textContent = `Welcome, ${user.name}`;
  }

  const fetchMyToken = async () => {
    try {
      const res = await fetch(`${API_URL}/tokens/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (res.status === 404) {
        document.getElementById('noTokenState').style.display = 'block';
        document.getElementById('activeTokenState').style.display = 'none';
        return null;
      }
      
      if (!res.ok) throw new Error(data.message);
      
      renderToken(data.data);
      return data.data;
    } catch (err) {
      console.error(err);
      if (err.message.includes('token') || err.message.includes('Auth')) {
         window.location.href = 'index.html';
      }
    }
  };

  const renderToken = async (tokenData) => {
    document.getElementById('noTokenState').style.display = 'none';
    document.getElementById('activeTokenState').style.display = 'block';
    
    const statusEl = document.getElementById('tokenStatus');
    statusEl.textContent = tokenData.status.replace('_', ' ');
    statusEl.className = `status-badge status-${tokenData.status}`;
    
    document.getElementById('tokenNumber').textContent = tokenData.tokenNumber;
    document.getElementById('serviceName').textContent = tokenData.serviceId.name;
    
    const pos = tokenData.queuePosition;
    document.getElementById('queuePosition').textContent = pos ? pos : '--';
    document.getElementById('estWait').textContent = pos ? (pos * tokenData.serviceId.avgServiceTimeMinutes) : '--';
    
    // Show QR only if RESERVED
    if (tokenData.status === 'RESERVED') {
      try {
        const qrRes = await fetch(`${API_URL}/tokens/${tokenData._id}/qr`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const qrData = await qrRes.json();
        if (qrRes.ok) {
          document.getElementById('qrCode').src = qrData.data.qrDataUrl;
          document.getElementById('qrContainer').style.display = 'flex';
        }
      } catch (err) { console.error('Failed to load QR', err); }
    } else {
      document.getElementById('qrContainer').style.display = 'none';
    }
  };

  // Connect Socket.IO
  socket = io('http://localhost:5000/patient', {
    auth: { token }
  });

  socket.on('connect', () => {
    console.log('Socket connected');
    fetchMyToken(); // Re-sync state on connect/reconnect
  });

  socket.on('token:reserved', (data) => renderToken(data));
  
  socket.on('token:checked_in', (data) => {
    document.getElementById('systemMessage').textContent = data.message;
    document.getElementById('systemMessage').style.color = 'var(--status-waiting)';
    fetchMyToken(); // refresh state
  });

  socket.on('token:called', (data) => {
    document.getElementById('systemMessage').textContent = data.message;
    document.getElementById('systemMessage').style.color = 'var(--status-called)';
    fetchMyToken();
  });

  socket.on('token:serving', (data) => {
    document.getElementById('systemMessage').textContent = data.message;
    document.getElementById('systemMessage').style.color = 'var(--status-serving)';
    fetchMyToken();
  });

  socket.on('token:expired', (data) => {
    alert(data.message);
    fetchMyToken();
  });

  socket.on('token:cancelled', () => {
    document.getElementById('systemMessage').textContent = '';
    fetchMyToken();
  });

  socket.on('token:completed', (data) => {
    alert(data.message);
    fetchMyToken();
  });

  socket.on('token:no_show', (data) => {
    alert(data.message);
    fetchMyToken();
  });

  document.getElementById('cancelBtn').addEventListener('click', async () => {
    if(!confirm('Are you sure you want to cancel your reservation?')) return;
    
    const activeData = await fetchMyToken();
    if (!activeData) return;

    try {
      const res = await fetch(`${API_URL}/tokens/${activeData._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchMyToken();
    } catch(err) { console.error(err); }
  });

  const startDashboardFlow = () => {
    const freshUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (!freshUser.isVerified) {
      const verifyCard = document.getElementById('verifyAccountCard');
      if (verifyCard) verifyCard.style.display = 'block';
      document.getElementById('noTokenState').style.display = 'none';
      document.getElementById('activeTokenState').style.display = 'none';

      setupVerificationFlow(() => {
        if (verifyCard) verifyCard.style.display = 'none';
        fetchMyToken();
      });
    } else {
      const verifyCard = document.getElementById('verifyAccountCard');
      if (verifyCard) verifyCard.style.display = 'none';
      fetchMyToken();
    }
  };

  startDashboardFlow();
}

// ── Request Token Logic (request.html) ────────────────────────────────────

if (document.getElementById('requestForm')) {
  const token = localStorage.getItem('token');
  if (!token) window.location.href = 'index.html';

  const select = document.getElementById('serviceSelect');
  const errorEl = document.getElementById('requestError');
  const btn = document.getElementById('requestBtn');
  const verifyCard = document.getElementById('verifyAccountCard');
  const requestCard = document.getElementById('requestCard');

  const loadServices = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const orgSlug = 'city-hospital';

      const res = await fetch(`${API_URL}/public/services?orgSlug=${orgSlug}`);
      const data = await res.json();
      
      if (res.ok && data.data.length > 0) {
        select.innerHTML = '<option value="">Select a service...</option>';
        data.data.forEach(s => {
          select.innerHTML += `<option value="${s._id}">${s.name} (Wait: ~${s.avgServiceTimeMinutes}m/patient)</option>`;
        });
      } else {
        select.innerHTML = '<option value="">No services available</option>';
      }
    } catch(e) {
      console.error(e);
      select.innerHTML = '<option value="">Error loading services</option>';
    }
  };

  const startRequestFlow = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.isVerified) {
      if (verifyCard) verifyCard.style.display = 'block';
      if (requestCard) requestCard.style.display = 'none';

      setupVerificationFlow(() => {
        if (verifyCard) verifyCard.style.display = 'none';
        if (requestCard) requestCard.style.display = 'block';
        loadServices();
      });
    } else {
      if (verifyCard) verifyCard.style.display = 'none';
      if (requestCard) requestCard.style.display = 'block';
      loadServices();
    }
  };

  startRequestFlow();

  document.getElementById('requestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    btn.disabled = true;

    const serviceId = select.value;
    if(!serviceId) {
      errorEl.textContent = 'Please select a service';
      errorEl.style.display = 'block';
      btn.disabled = false;
      return;
    }

    const body = {
      serviceId,
      idempotencyKey: generateUUID(),
      source: 'ONLINE'
    };

    try {
      const res = await fetch(`${API_URL}/tokens`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': body.idempotencyKey
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message);
      
      window.location.href = 'dashboard.html';
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('not verified')) {
        let user = JSON.parse(localStorage.getItem('user') || '{}');
        user.isVerified = false;
        localStorage.setItem('user', JSON.stringify(user));
        startRequestFlow();
      } else {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
      btn.disabled = false;
    }
  });
}

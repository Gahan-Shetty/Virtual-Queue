// staff.js
const API_URL = 'http://localhost:5000/api';
let socket;
let currentServiceId = null;
let currentCounterId = null;
let activeTokenId = null;

const token = localStorage.getItem('staff_token');
const user = JSON.parse(localStorage.getItem('staff_user'));

// ── Shared UI ──────────────────────────────────────────────────────────────

if (document.getElementById('logoutBtn')) {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      if (token) {
        await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      }
    } catch(e) {}
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_user');
    window.location.href = '/staff/index.html';
  });
  
  if (user) {
    const staffInfo = document.getElementById('staffInfo');
    if (staffInfo) {
      staffInfo.innerHTML = `
        <strong>${user.name}</strong><br>
        ${user.role}<br>
        <span style="opacity:0.7">Org: ${user.orgId}</span>
      `;
    }
    
    // Show receptionist-only tabs
    if (user.role === 'RECEPTIONIST' || user.role === 'ADMIN') {
      const walk = document.getElementById('navWalkin');
      const check = document.getElementById('navCheckin');
      if (walk) walk.style.display = 'block';
      if (check) check.style.display = 'block';
    }
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
      if (data.data.user.role === 'PATIENT') throw new Error('Patients cannot login here');
      
      localStorage.setItem('staff_token', data.data.accessToken);
      localStorage.setItem('staff_user', JSON.stringify(data.data.user));
      window.location.href = 'console.html';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

// ── Helper: Load Services & Counters ───────────────────────────────────────

const fetchAdminServices = async () => {
  const res = await fetch(`${API_URL}/admin/services`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to load services');
  const data = await res.json();
  return data.data;
};

const fetchAdminCounters = async (serviceId) => {
  const res = await fetch(`${API_URL}/admin/counters?serviceId=${serviceId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to load counters');
  const data = await res.json();
  return data.data;
};

// ── Console Logic (console.html) ───────────────────────────────────────────

if (document.getElementById('queueTableBody')) {
  if (!token) window.location.href = '/staff/index.html';

  const svcSelect = document.getElementById('serviceSelect');
  const cntSelect = document.getElementById('counterSelect');
  const tableBody = document.getElementById('queueTableBody');

  const loadQueue = async () => {
    if (!currentServiceId) return;
    try {
      const res = await fetch(`${API_URL}/tokens?serviceId=${currentServiceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      renderQueue(data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const renderQueue = (tokens) => {
    tableBody.innerHTML = '';
    
    // Sort logic handled mostly by backend, but we filter out CALLED/SERVING for the waiting list
    const waitingTokens = tokens.filter(t => ['WAITING', 'CHECKED_IN'].includes(t.status));
    const activeTokens = tokens.filter(t => ['CALLED', 'SERVING'].includes(t.status));
    
    // Update active patient panel if we have a counter selected
    if (currentCounterId) {
      const myActive = activeTokens.find(t => t.counterId && (t.counterId._id === currentCounterId || t.counterId._id?.toString() === currentCounterId));
      if (myActive) {
        document.getElementById('activePatientPanel').style.display = 'block';
        document.getElementById('activeToken').textContent = myActive.tokenNumber;
        document.getElementById('activeName').textContent = myActive.patientId?.name || 'Walk-in';
        activeTokenId = myActive._id;
        
        document.getElementById('btnServing').disabled = myActive.status !== 'CALLED';
        document.getElementById('btnComplete').disabled = !['CALLED', 'SERVING'].includes(myActive.status);
        document.getElementById('btnNoShow').disabled = myActive.status !== 'CALLED';
      } else {
        document.getElementById('activePatientPanel').style.display = 'none';
        activeTokenId = null;
      }
    } else {
      document.getElementById('activePatientPanel').style.display = 'none';
    }

    if (waitingTokens.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No patients waiting</td></tr>';
      return;
    }

    waitingTokens.forEach((t, i) => {
      const waitMins = t.checkedInAt ? Math.floor((Date.now() - new Date(t.checkedInAt).getTime()) / 60000) : 0;
      tableBody.innerHTML += `
        <tr>
          <td>#${i + 1}</td>
          <td style="font-weight:600;">${t.tokenNumber}</td>
          <td>${t.patientId?.name || 'Walk-in Patient'}</td>
          <td><span class="badge badge-${t.status}">${t.status}</span></td>
          <td>${waitMins} min</td>
        </tr>
      `;
    });
  };

  const initConsole = async () => {
    try {
      const services = await fetchAdminServices();
      services.forEach(s => {
        svcSelect.innerHTML += `<option value="${s._id}">${s.name}</option>`;
      });
      
      // Auto-select if user is assigned to one
      if (user.serviceId) {
        svcSelect.value = user.serviceId;
        currentServiceId = user.serviceId;
        await onServiceChange();
      }
    } catch (e) { console.error(e); }
  };

  const onServiceChange = async () => {
    currentServiceId = svcSelect.value;
    cntSelect.innerHTML = '<option value="">Select Counter...</option>';
    if (!currentServiceId) return;

    try {
      const counters = await fetchAdminCounters(currentServiceId);
      counters.forEach(c => {
        cntSelect.innerHTML += `<option value="${c._id}">${c.name}</option>`;
      });
      
      if (user.counterId) {
        cntSelect.value = user.counterId;
        currentCounterId = user.counterId;
      }
      loadQueue();
    } catch (e) { console.error(e); }
  };

  svcSelect.addEventListener('change', onServiceChange);
  cntSelect.addEventListener('change', () => {
    currentCounterId = cntSelect.value;
    loadQueue();
  });

  // Action Buttons
  document.getElementById('callNextBtn').addEventListener('click', async () => {
    if (!currentServiceId || !currentCounterId) return alert('Select Service and Counter first');
    try {
      const res = await fetch(`${API_URL}/queue/call-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ serviceId: currentServiceId, counterId: currentCounterId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      loadQueue();
    } catch (err) { alert(err.message); }
  });

  document.getElementById('btnServing').addEventListener('click', async () => {
    if (!activeTokenId) return;
    await fetch(`${API_URL}/queue/${activeTokenId}/serving`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadQueue();
  });

  document.getElementById('btnComplete').addEventListener('click', async () => {
    if (!activeTokenId) return;
    await fetch(`${API_URL}/queue/${activeTokenId}/complete`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadQueue();
  });

  document.getElementById('btnNoShow').addEventListener('click', async () => {
    if (!activeTokenId) return;
    if(!confirm('Mark this patient as no-show?')) return;
    await fetch(`${API_URL}/queue/${activeTokenId}/no-show`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadQueue();
  });

  // Socket setup
  socket = io('http://localhost:5000/staff', { auth: { token } });
  
  // Re-fetch on any queue event
  const events = ['queue:token_added', 'queue:patient_arrived', 'queue:called', 'queue:serving', 'queue:completed', 'queue:no_show', 'queue:token_removed'];
  events.forEach(ev => socket.on(ev, () => loadQueue()));

  initConsole();
}

// ── Check-in Logic (checkin.html) ──────────────────────────────────────────

if (document.getElementById('video')) {
  if (!token) window.location.href = '/staff/index.html';

  const video = document.getElementById('video');
  const canvasElement = document.getElementById('canvas');
  const canvas = canvasElement.getContext('2d');
  const statusEl = document.getElementById('checkinStatus');
  let scanning = true;

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((stream) => {
    video.srcObject = stream;
    video.setAttribute('playsinline', true);
    video.play();
    requestAnimationFrame(tick);
  });

  const tick = () => {
    if (video.readyState === video.HAVE_ENOUGH_DATA && scanning) {
      canvasElement.height = video.videoHeight;
      canvasElement.width = video.videoWidth;
      canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
      const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      
      if (code) {
        processQR(code.data);
      }
    }
    requestAnimationFrame(tick);
  };

  const processQR = async (qrDataStr) => {
    try {
      const data = JSON.parse(qrDataStr);
      if (data.type !== 'TOKEN_CHECKIN' || !data.tokenId) throw new Error('Invalid QR code');
      
      scanning = false; // pause scan
      statusEl.style.color = '#ca8a04';
      statusEl.textContent = 'Processing...';

      const res = await fetch(`${API_URL}/checkin/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tokenId: data.tokenId })
      });
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.message);
      
      statusEl.style.color = '#16a34a';
      statusEl.textContent = `Success: Checked in ${result.data.tokenNumber}`;
      setTimeout(() => { scanning = true; statusEl.textContent = ''; }, 3000);
      
    } catch (err) {
      statusEl.style.color = '#dc2626';
      statusEl.textContent = err.message;
      setTimeout(() => { scanning = true; }, 3000);
    }
  };

// Manual fallback (for Check-in)
  const svcSelect = document.getElementById('serviceSelect');
  fetchAdminServices().then(services => {
    svcSelect.innerHTML = '<option value="">Select service...</option>';
    services.forEach(s => svcSelect.innerHTML += `<option value="${s._id}">${s.name}</option>`);
  }).catch(() => {
    svcSelect.innerHTML = '<option value="">Error loading services</option>';
  });

  document.getElementById('manualCheckinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const serviceId = svcSelect.value;
    const tokenNumber = document.getElementById('tokenNumber').value.trim().toUpperCase();
    
    statusEl.style.color = '#ca8a04';
    statusEl.textContent = 'Processing...';

    try {
      const res = await fetch(`${API_URL}/checkin/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ serviceId, tokenNumber })
      });
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.message);
      
      statusEl.style.color = '#16a34a';
      statusEl.textContent = `Success: Checked in ${result.data.tokenNumber}`;
      document.getElementById('tokenNumber').value = '';
    } catch (err) {
      statusEl.style.color = '#dc2626';
      statusEl.textContent = err.message;
    }
  });
}

// ── Walk-in Logic (walkin.html) ────────────────────────────────────────────

if (document.getElementById('walkinForm')) {
  if (!token) window.location.href = '/staff/index.html';

  const svcSelect = document.getElementById('serviceSelect');
  fetchAdminServices().then(services => {
    svcSelect.innerHTML = '<option value="">Select service...</option>';
    services.forEach(s => svcSelect.innerHTML += `<option value="${s._id}">${s.name}</option>`);
  }).catch(() => {
    svcSelect.innerHTML = '<option value="">Error loading services</option>';
  });

  document.getElementById('walkinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('errorMsg');
    const successEl = document.getElementById('successMsg');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    // Helper to generate UUID
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    const lookupBtn = document.getElementById('lookupBtn');
    if (lookupBtn) {
      lookupBtn.addEventListener('click', async () => {
        const q = document.getElementById('searchQuery').value.trim();
        const msgEl = document.getElementById('lookupMsg');
        if (!q) {
          msgEl.textContent = 'Please enter an email or phone number';
          msgEl.style.color = 'red';
          return;
        }

        msgEl.textContent = 'Searching...';
        msgEl.style.color = 'var(--text-secondary)';

        try {
          const res = await fetch(`${API_URL}/admin/users/lookup?q=${encodeURIComponent(q)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.message);

          const p = result.data;
          document.getElementById('existingPatientId').value = p._id;
          document.getElementById('patientName').value = p.name;
          document.getElementById('patientPhone').value = p.phone;
          document.getElementById('patientEmail').value = p.email || '';
          
          document.getElementById('patientName').disabled = true;
          document.getElementById('patientPhone').disabled = true;
          document.getElementById('patientEmail').disabled = true;

          msgEl.textContent = 'Patient found and loaded!';
          msgEl.style.color = 'green';
        } catch (err) {
          msgEl.textContent = err.message;
          msgEl.style.color = 'red';
          document.getElementById('existingPatientId').value = '';
          document.getElementById('patientName').disabled = false;
          document.getElementById('patientPhone').disabled = false;
          document.getElementById('patientEmail').disabled = false;
        }
      });
    }

    const body = {
      serviceId: svcSelect.value,
      idempotencyKey: generateUUID(),
      source: 'WALK_IN',
      // In a real system, you'd find or create the patient first.
      // We will just try to create a new patient account on the fly if they don't exist,
      // or pass enough info for the backend.
      // But the spec says receptionist provides patientId. Let's assume we have to register them first.
    };

    try {
      let pId = document.getElementById('existingPatientId').value;
      
      if (!pId) {
        // 1. Create Patient (or fail if exists - simplified demo)
        const orgSlug = localStorage.getItem('orgSlug') || 'city-hospital';
        const patientBody = {
          orgSlug: orgSlug,
          name: document.getElementById('patientName').value,
          phone: document.getElementById('patientPhone').value,
          email: document.getElementById('patientEmail').value || `${Date.now()}@temp.com`,
          password: 'Password123!' // default for walkins
        };

        const regRes = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patientBody)
        });
        const regData = await regRes.json();
        
        if (!regRes.ok) {
          if (regRes.status === 409 || (regData.message && regData.message.toLowerCase().includes('already in use'))) {
            const lookupRes = await fetch(`${API_URL}/admin/users/lookup?q=${encodeURIComponent(patientBody.email || patientBody.phone)}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const lookupData = await lookupRes.json();
            if (lookupRes.ok && lookupData.data) {
              pId = lookupData.data._id;
            } else {
              throw new Error('Patient exists but could not be retrieved.');
            }
          } else {
            throw new Error(regData.message || 'Patient registration failed.');
          }
        } else {
          pId = regData.data.user._id;
        }
      }

      // 2. Request Token
      body.patientId = pId;
      const res = await fetch(`${API_URL}/tokens`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': body.idempotencyKey
        },
        body: JSON.stringify(body)
      });
      const result = await res.json();
      
      if (!res.ok) throw new Error(result.message);
      
      successEl.textContent = `Token ${result.data.tokenNumber} created! Patient can now wait or check-in.`;
      successEl.style.display = 'block';
      
      // Auto check-in for walkins is a good UX, but spec says check-in is separate.
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

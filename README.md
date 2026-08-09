# 🏥 Virtual Queue — Hybrid Virtual Queue Management System

> A production-ready, full-stack system for hospitals and organisations to manage patient queues virtually. Patients reserve a slot online and **must physically check in** before entering the active queue — eliminating both no-shows and overcrowded waiting rooms.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Seeding Initial Data](#seeding-initial-data)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [User Roles & Flows](#-user-roles--flows)
- [Real-Time Events (Socket.IO)](#-real-time-events-socketio)
- [Known Limitations](#-known-limitations)
- [Contributing](#-contributing)

---

## 🌐 Overview

The **Virtual Queue System** solves a common problem in hospitals and service centres: long, unpredictable physical queues. Patients can book a slot from home within a daily booking window, receive a token, and arrive at the hospital within their check-in window — not hours in advance.

The system enforces a **hybrid model**:
1. **Online Reservation** — patients reserve a token via the patient portal within a configured booking window.
2. **Physical Check-in** — patients must physically arrive and check in (via QR scan or manual entry) before they enter the active queue.
3. **Queue Management** — staff call patients in check-in order (fairness policy), serve them at counters, and mark completion or no-show.

Multi-tenancy is built in from day one — a single backend instance can serve multiple hospitals/organisations, each with their own services, counters, staff, and booking configuration.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **Online Token Reservation** | Patients book a slot within a configurable daily window |
| **QR Check-In** | Staff scan patient's unique token QR at arrival |
| **Manual Check-In** | Receptionist types token number as fallback |
| **Atomic Capacity Control** | Redis Lua scripts prevent over-booking even under concurrent load |
| **Reservation Expiry** | Unchecked-in tokens auto-expire via a background BullMQ worker |
| **Real-Time Updates** | Socket.IO pushes queue status changes instantly — no polling |
| **Multi-Counter Routing** | Counter assigned at call time, not check-in time |
| **No-Show Management** | Staff marks no-show; patient can rejoin once (configurable cap) |
| **Multi-Tenancy** | Full `orgId` isolation — multiple orgs on one backend |
| **RBAC** | Four roles: `PATIENT`, `RECEPTIONIST`, `DOCTOR`, `ADMIN` |
| **JWT Auth** | Short-lived access tokens (15m) + rotating refresh tokens (7d) |
| **OTP Verification** | Email or SMS OTP for patient account verification |
| **Idempotency** | UUID-keyed request deduplication prevents double-booking |
| **Rate Limiting** | Redis-backed, per-IP limits on all sensitive endpoints |
| **Admin Dashboard** | Live stats (total / waiting / completed / no-show + expired) |

---

## 🏛️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Static)                          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐ │
│  │  Patient Portal  │  │   Staff Console  │  │    Admin Panel      │ │
│  │  (HTML/CSS/JS)  │  │  (HTML/CSS/JS)   │  │  (HTML/CSS/JS)      │ │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬──────────┘ │
│           │                    │                         │            │
│     REST + Socket.IO     REST + Socket.IO         REST + Socket.IO   │
└───────────┼────────────────────┼─────────────────────────┼───────────┘
            │                    │                         │
┌───────────▼────────────────────▼─────────────────────────▼───────────┐
│                    Node.js + Express Backend (Port 5000)              │
│                                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │   Auth   │  │  Tokens  │  │  Queue   │  │ Check-in │             │
│  │ Module   │  │  Module  │  │  Module  │  │  Module  │             │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘             │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                  Socket.IO (3 Namespaces)                       │  │
│  │   /patient   →  per-user rooms (token:called, token:expired)   │  │
│  │   /staff     →  per-service + per-org rooms (queue events)     │  │
│  │   /admin     →  per-org rooms (stats updates)                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────┐   ┌─────────────────────────────────────┐  │
│  │      MongoDB        │   │         Redis                        │  │
│  │  (Primary DB)       │   │  Capacity counters (Lua atomic)      │  │
│  │  Tokens, Users,     │   │  OTP store (TTL)                     │  │
│  │  Services,          │   │  Idempotency locks                   │  │
│  │  Counters, History  │   │  Token expiry timestamps             │  │
│  └─────────────────────┘   │  BullMQ expiry worker queue         │  │
│                             └─────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend API** | Node.js 20 + Express 5 | REST API server |
| **Primary Database** | MongoDB + Mongoose | Persistent data store |
| **Cache / State** | Redis (ioredis) | Capacity counters, OTP, idempotency, BullMQ |
| **Real-time** | Socket.IO 4 | Live queue updates to all portals |
| **Auth** | JWT (jsonwebtoken) | Access + refresh tokens |
| **Background Jobs** | BullMQ | Reservation expiry sweep every 30s |
| **Email** | Nodemailer | OTP delivery (SMTP) |
| **QR Code** | qrcode (generate) + jsQR (scan) | Token check-in QR |
| **Frontend** | Vanilla HTML / CSS / JS | No framework — served statically |
| **Logging** | Winston + Morgan | Structured app + HTTP logs |
| **Validation** | Joi | Request schema validation |
| **Security** | Helmet, CORS, express-rate-limit | Security headers + rate limiting |

---

## 📂 Project Structure

```
Virtual_Queue/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js              # MongoDB connection
│   │   │   ├── redis.js           # ioredis client
│   │   │   ├── socket.js          # Socket.IO namespaces + room management
│   │   │   └── env.js             # Environment variable validation (Joi)
│   │   ├── models/
│   │   │   ├── User.js            # All roles (PATIENT/RECEPTIONIST/DOCTOR/ADMIN)
│   │   │   ├── Organization.js    # Multi-tenant root
│   │   │   ├── Service.js         # Queue services/departments
│   │   │   ├── Counter.js         # Physical counters/windows
│   │   │   ├── Token.js           # Core token entity (full state machine)
│   │   │   └── TokenHistory.js    # Audit trail per state transition
│   │   ├── modules/
│   │   │   ├── auth/              # register, login, refresh, OTP verify
│   │   │   ├── token/             # request, cancel, list, QR generation
│   │   │   ├── checkin/           # QR scan, manual, self check-in
│   │   │   ├── queue/             # call-next, serving, complete, no-show, rejoin
│   │   │   ├── admin/             # staff/service/counter CRUD, org config, dashboard
│   │   │   ├── public/            # unauthenticated service/org lookup
│   │   │   └── notification/      # Email + SMS stubs
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js  # authenticate, authorize, requireVerified
│   │   │   ├── rateLimiter.js      # Redis-backed rate limits
│   │   │   ├── idempotency.js      # Idempotency-Key enforcement
│   │   │   └── errorHandler.js     # Global AppError handler
│   │   ├── scripts/
│   │   │   ├── lua/
│   │   │   │   ├── allocateToken.lua  # Atomic capacity check + increment
│   │   │   │   └── checkIn.lua        # Atomic reservation check + state flip
│   │   │   └── workers/
│   │   │       └── expiryWorker.js    # BullMQ job: expire stale reservations
│   │   └── utils/
│   │       ├── jwt.js             # Token generation + verification
│   │       ├── otp.js             # Redis-backed OTP generate/verify
│   │       ├── qr.js              # QR code generation utility
│   │       ├── logger.js          # Winston logger
│   │       └── apiResponse.js     # Standardised API response helpers
│   ├── server.js                  # Entry point: DB + Redis + Socket.IO + Worker
│   ├── .env.example               # Environment variable template
│   └── package.json
│
└── frontend/
    ├── patient/
    │   ├── index.html             # Login + Register
    │   ├── dashboard.html         # Token status, QR code, live queue position
    │   ├── request.html           # Service selection + token request
    │   └── assets/
    │       ├── patient.css
    │       └── patient.js         # Auth, verification flow, dashboard, token request
    │
    ├── staff/
    │   ├── index.html             # Staff login
    │   ├── console.html           # Live queue console (call/serve/complete/no-show)
    │   ├── walkin.html            # Create walk-in token
    │   ├── checkin.html           # QR scanner + manual check-in
    │   └── assets/
    │       ├── staff.css
    │       └── staff.js           # All staff portal logic
    │
    └── admin/
        ├── index.html             # Admin login
        ├── dashboard.html         # Live stats + system config
        ├── services.html          # Service and counter management
        └── assets/
            ├── admin.css
            └── admin.js           # Admin portal logic
```

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version |
|------------|---------|
| Node.js | ≥ 18.x |
| MongoDB | ≥ 6.x (local or Atlas) |
| Redis | ≥ 6.x (local or Redis Cloud) |
| npm | ≥ 9.x |

### Backend Setup

```bash
# 1. Clone the repository
git clone https://github.com/Gahan-Shetty/Virtual-Queue.git
cd Virtual-Queue/backend

# 2. Install dependencies
npm install

# 3. Copy the environment template and fill in your values
cp .env.example .env
# Edit .env with your MongoDB URI, Redis config, JWT secrets, etc.

# 4. Start the development server (auto-restarts on changes)
npm run dev

# Server will start at http://localhost:5000
# Health check: http://localhost:5000/health
```

### Frontend Setup

The frontend is pure static HTML/CSS/JS — no build step required.

```bash
# From the project root
cd Virtual-Queue

# Option A: serve with npx serve (recommended for dev)
npx serve frontend

# Option B: open files directly in browser
# Navigate to frontend/patient/index.html, etc.
```

> **Note:** The frontend currently points to `http://localhost:5000/api`. If you change the backend port, update `API_URL` at the top of each portal's JS file.

### Seeding Initial Data

The database starts empty. You need to create an organisation and an admin user before anything else works.

**Step 1 — Create your Organisation** (via MongoDB shell or Compass):

```javascript
db.organizations.insertOne({
  name: "City Hospital",
  slug: "city-hospital",
  isActive: true,
  bookingOpenTime: "08:00",
  bookingCloseTime: "11:00",
  serviceStartTime: "09:00",
  serviceEndTime: "13:00",
  onlineCapacity: 60,
  walkInCapacity: 40,
  reservationExpiryMinutes: 30,
  checkInGracePeriodMinutes: 10,
  noShowGracePeriodMinutes: 5,
  maxNoShowRejoinsPerDay: 1
});
```

**Step 2 — Create an Admin user** (via API):

```bash
# First, register with any email (creates a PATIENT — then we'll manually upgrade)
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@hospital.com",
    "phone": "9999999999",
    "password": "Admin@123",
    "orgSlug": "city-hospital"
  }'

# Then in MongoDB shell, update the role:
db.users.updateOne(
  { email: "admin@hospital.com" },
  { $set: { role: "ADMIN", isVerified: true } }
)
```

**Step 3 — Login and create Services + Counters** via the Admin Portal or API:

```bash
# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hospital.com","password":"Admin@123","orgSlug":"city-hospital"}'

# Use the returned accessToken to create a service
curl -X POST http://localhost:5000/api/admin/services \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"OPD","tokenPrefix":"OPD","avgServiceTimeMinutes":5,"dailyCapacity":50}'

# Create a counter for that service
curl -X POST http://localhost:5000/api/admin/counters \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Counter 1","serviceId":"<SERVICE_ID>"}'
```

---

## 🔐 Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | ✅ | `development` or `production` |
| `PORT` | ✅ | Backend port (default: `5000`) |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `REDIS_HOST` | ✅ | Redis host (default: `127.0.0.1`) |
| `REDIS_PORT` | ✅ | Redis port (default: `6379`) |
| `REDIS_PASSWORD` | ❌ | Redis password (leave empty for local) |
| `JWT_ACCESS_SECRET` | ✅ | 64-char random hex string for access tokens |
| `JWT_REFRESH_SECRET` | ✅ | 64-char random hex string for refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | ✅ | Access token TTL (default: `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | ✅ | Refresh token TTL (default: `7d`) |
| `OTP_EXPIRES_MINUTES` | ✅ | OTP validity window (default: `10`) |
| `EXPIRY_POLL_INTERVAL_SECONDS` | ✅ | How often the expiry worker runs (default: `30`) |
| `CLIENT_ORIGIN` | ✅ | Frontend origin for CORS (e.g. `http://localhost:3000`) |
| `SMTP_HOST` | ❌ | SMTP server for OTP emails |
| `SMTP_PORT` | ❌ | SMTP port (587 for TLS) |
| `SMTP_USER` | ❌ | SMTP username |
| `SMTP_PASS` | ❌ | SMTP password |
| `SMTP_FROM` | ❌ | From address for emails |
| `TWILIO_ACCOUNT_SID` | ❌ | Twilio SID for SMS OTP (stub only) |
| `TWILIO_AUTH_TOKEN` | ❌ | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | ❌ | Twilio phone number |

> 💡 **In development**, if SMTP is not configured, OTP codes are printed directly to the backend terminal console — useful for testing.

Generate secure JWT secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 📡 API Reference

All API routes are prefixed with `/api`.

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | ❌ | Patient self-registration |
| `POST` | `/auth/login` | ❌ | Login (all roles) |
| `POST` | `/auth/refresh` | ❌ | Refresh access token |
| `POST` | `/auth/logout` | ✅ | Invalidate refresh token |
| `POST` | `/auth/otp/send` | ✅ | Send OTP (email or phone) |
| `POST` | `/auth/otp/verify` | ✅ | Verify OTP → mark account verified |
| `GET`  | `/auth/me` | ✅ | Get current user profile |
| `PATCH`| `/auth/me` | ✅ | Update name / phone |

### Tokens
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/tokens` | ✅ Patient/Receptionist | Request a new token (requires `Idempotency-Key` header) |
| `GET`  | `/tokens/my` | ✅ Patient | Get my active token for today |
| `GET`  | `/tokens` | ✅ Staff/Admin | List queue for a service (`?serviceId=`) |
| `GET`  | `/tokens/:id` | ✅ | Get specific token |
| `GET`  | `/tokens/:id/qr` | ✅ | Get QR code data URL |
| `DELETE`| `/tokens/:id` | ✅ | Cancel a token |

### Check-In
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/checkin/qr` | ✅ Staff | Check in by scanning patient QR |
| `POST` | `/checkin/manual` | ✅ Receptionist | Check in by token number |
| `POST` | `/checkin/self` | ✅ Patient | Self check-in via location QR |

### Queue Operations
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/queue/call-next` | ✅ Staff | Call next waiting patient |
| `PATCH`| `/queue/:id/serving` | ✅ Staff | Mark patient as arrived at counter |
| `PATCH`| `/queue/:id/complete` | ✅ Staff | Mark service complete |
| `PATCH`| `/queue/:id/no-show` | ✅ Staff | Mark patient as no-show |
| `POST` | `/queue/rejoin` | ✅ Receptionist | Create new token after no-show |
| `GET`  | `/queue/stats` | ✅ Staff | Live queue stats for a service |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET`  | `/admin/dashboard` | ✅ Admin | Today's aggregate stats |
| `GET`  | `/admin/services` | ✅ Staff/Admin | List all services |
| `POST` | `/admin/services` | ✅ Admin | Create a service |
| `PATCH`| `/admin/services/:id` | ✅ Admin | Update a service |
| `DELETE`| `/admin/services/:id` | ✅ Admin | Deactivate a service |
| `GET`  | `/admin/counters` | ✅ Staff/Admin | List counters (`?serviceId=`) |
| `POST` | `/admin/counters` | ✅ Admin | Create a counter |
| `PATCH`| `/admin/counters/:id` | ✅ Admin | Update a counter |
| `GET`  | `/admin/staff` | ✅ Admin | List all staff |
| `POST` | `/admin/staff` | ✅ Admin | Create a staff account |
| `PATCH`| `/admin/staff/:id` | ✅ Admin | Update staff (service/counter assignment) |
| `DELETE`| `/admin/staff/:id` | ✅ Admin | Deactivate staff |
| `GET`  | `/admin/config` | ✅ Admin | Get org configuration |
| `PATCH`| `/admin/config` | ✅ Admin | Update org configuration |

### Public (No Auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/public/services?orgSlug=` | List active services for an org |
| `GET`  | `/public/org?orgSlug=` | Get org info |

---

## 👥 User Roles & Flows

### Patient Flow
```
Register → Verify OTP → Login → Request Token → Arrive at Hospital
→ Staff Scans QR (or Manual Check-in) → Wait to be Called
→ Proceed to Counter → Service Complete
```

### Receptionist Flow
```
Login → View Queue Console → Call Next Patient → Mark Serving/Complete/No-Show
     → Create Walk-in Token → Manual Check-in → Handle No-show Rejoin
```

### Doctor Flow
```
Login → View Queue Console → Call Next Patient → Mark Serving → Complete
```

### Admin Flow
```
Login → View Dashboard Stats → Configure Booking Window & Capacities
     → Create Services → Create Counters → Create Staff Accounts
```

---

## ⚡ Real-Time Events (Socket.IO)

Connect to the appropriate namespace with `auth: { token: '<access_token>' }`.

### `/patient` namespace — Patient events
| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ userId, timestamp }` | Connection confirmed |
| `token:reserved` | Token object | New token created |
| `token:checked_in` | `{ tokenId, tokenNumber, status, message }` | Check-in confirmed |
| `token:called` | `{ tokenId, counterName, message, noShowGraceMs }` | Called to counter |
| `token:serving` | `{ tokenId, message }` | Serving started |
| `token:completed` | `{ tokenId, completedAt, message }` | Service done |
| `token:no_show` | `{ tokenId, message }` | Marked no-show |
| `token:expired` | `{ tokenId, message }` | Reservation expired |
| `token:cancelled` | `{ tokenId }` | Token cancelled |
| `token:expiry_warning` | `{ tokenId, minutesLeft, message }` | Pre-expiry warning |

### `/staff` namespace — Queue events
| Event | Description |
|-------|-------------|
| `queue:token_added` | New token reserved |
| `queue:patient_arrived` | Patient checked in (enters WAITING) |
| `queue:called` | Patient called to a counter |
| `queue:serving` | Patient arrived at counter |
| `queue:completed` | Service completed |
| `queue:no_show` | Patient marked no-show |
| `queue:token_removed` | Token cancelled |

### `/admin` namespace — Admin events
| Event | Description |
|-------|-------------|
| `admin:stats_updated` | Any queue change — reload dashboard counters |
| `admin:config_updated` | Org config changed |

---

## ⚠️ Known Limitations

1. **Walk-in for returning patients**: If a patient was previously registered, the walk-in form will fail (duplicate email). A patient lookup by phone/email before registration is not yet implemented in the UI.
2. **`orgSlug` hardcoded**: The patient portal currently uses `'city-hospital'` as the org slug. Must be updated if using a different org.
3. **Booking window is UTC**: The booking window enforcement runs in UTC. Ensure your org config times are entered in UTC.
4. **No staff management UI**: Staff accounts must be created via the API (or MongoDB directly) — no admin UI form yet.
5. **No counter management UI**: Counters must be created via API.
6. **SMS OTP**: Twilio is stubbed — OTP for phone is printed to the terminal only.
7. **No production SSL**: The app should be run behind a reverse proxy (Nginx/Caddy) with HTTPS in production.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please ensure:
- No `.env` files are committed
- `node_modules/` is not committed
- All new backend routes have RBAC applied
- New environment variables are added to `.env.example`

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Built with ❤️ for reducing waiting room chaos in hospitals
</div>

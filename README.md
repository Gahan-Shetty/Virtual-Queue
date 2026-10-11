# 🏥 Virtual Queue

A smart, real-time virtual queue management system for hospitals and service centers. Patients reserve their spot online from anywhere, then physically check in on arrival with a QR code to enter the live queue — ending crowded waiting rooms and long lines.

---

## ⚡ Quick Start

### 1. Start Backend
```bash
cd backend
npm install
npm run dev
```
> The API server will start on `http://localhost:5000` (requires MongoDB and Redis running).

### 2. Start Frontend
```bash
# From the project root
npx serve frontend
```
> The application will be live at `http://localhost:3000` (or the port displayed in your terminal).

---

## 📖 Project Description & Purpose

In busy hospitals and clinics, waiting rooms are frequently overcrowded, and patients often waste hours sitting in physical lines without knowing when they will be seen.

**Virtual Queue** introduces a fair **hybrid queuing model**:
- **Remote Slot Reservation:** Patients don't have to wait physically at the clinic for hours. They book a token online through their phone or computer.
- **Physical Check-In Verification:** To prevent ghost bookings and no-shows, a reserved token only becomes active once the patient arrives and checks in (via QR code scan or receptionist).
- **Live Queue & Real-Time Tracking:** Once checked in, patients see live queue positions, estimated wait times, and get called directly to an assigned counter.

---

## 📁 Project Structure

```text
Virtual_Queue/
├── backend/                  # Node.js, Express, MongoDB & Redis API
│   ├── server.js             # API entrypoint & Socket.IO server
│   └── src/
│       ├── modules/          # Auth, Tokens, Queue, Notifications
│       ├── models/           # Database models (User, Token, Service, Org)
│       └── scripts/          # Redis Lua scripts for concurrency
│
├── frontend/                 # Complete frontend web application
│   ├── index.html            # 3D interactive landing & home page
│   ├── landing-src/          # React + Vite source for the landing page
│   ├── patient/              # Patient Portal (login, token booking, dashboard)
│   ├── staff/                # Staff Console (calling tokens, counter serving)
│   └── admin/                # Admin Panel (services, counters, analytics)
│
└── package.json              # Root project scripts & helpers
```

---

## 🔄 How It Works

1. **Patient Booking:**
   - Patient visits the portal, registers or logs in, and selects a department/service.
   - An online token is allocated with an estimated appointment window.
2. **Arrival & Check-In:**
   - Patient arrives at the hospital and shows their token's check-in QR code.
   - Reception staff scans or enters the token number, which officially transitions the patient into the live waiting queue.
3. **Live Calling & Service:**
   - Staff at available counters call the next waiting patient in order.
   - The patient's dashboard updates in real time with the assigned counter number.
   - Once the consultation is finished, staff marks the token completed.

---

## 🌐 Application Portals

| Portal | URL | Description |
|---|---|---|
| **Home Page** | `http://localhost:3000/` | Main landing page and portal navigation |
| **Patient Portal** | `http://localhost:3000/patient/` | Book token, view live queue position & QR code |
| **Staff Console** | `http://localhost:3000/staff/` | Counter operations, call & serve patients |
| **Admin Panel** | `http://localhost:3000/admin/` | Manage services, counters, staff & view stats |
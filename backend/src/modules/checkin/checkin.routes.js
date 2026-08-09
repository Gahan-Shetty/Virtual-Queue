'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./checkin.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

router.use(authenticate);

/** POST /api/checkin/qr — staff/kiosk scans patient's personal token QR */
router.post('/qr', authorize('RECEPTIONIST', 'DOCTOR', 'ADMIN'), controller.qrCheckIn);

/** POST /api/checkin/manual — receptionist checks in by token number */
router.post('/manual', authorize('RECEPTIONIST', 'ADMIN'), controller.manualCheckIn);

/** POST /api/checkin/self — patient self-check-in (if location QR policy is enabled) */
router.post('/self', authorize('PATIENT'), controller.selfCheckIn);

module.exports = router;

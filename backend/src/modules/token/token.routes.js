'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./token.controller');
const { authenticate, authorize, requireVerified } = require('../../middleware/auth.middleware');
const { tokenRequestLimiter } = require('../../middleware/rateLimiter');
const { idempotency } = require('../../middleware/idempotency');

// All token routes require authentication
router.use(authenticate);

/** POST /api/tokens — request a new token (online or walk-in) */
router.post(
  '/',
  tokenRequestLimiter,
  idempotency,
  controller.requestToken
);

/** GET /api/tokens/my — get my active token for today */
router.get('/my', controller.getMyToken);

/** GET /api/tokens/:tokenId — get a specific token */
router.get('/:tokenId', controller.getToken);

/** GET /api/tokens/:tokenId/qr — get QR code for a token (patient or staff) */
router.get('/:tokenId/qr', controller.getTokenQR);

/** DELETE /api/tokens/:tokenId — cancel a token */
router.delete('/:tokenId', controller.cancelToken);

/** GET /api/tokens — list tokens (staff/admin: service queue) */
router.get(
  '/',
  authorize('RECEPTIONIST', 'DOCTOR', 'ADMIN'),
  controller.listTokens
);

module.exports = router;

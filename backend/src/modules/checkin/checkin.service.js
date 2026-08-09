'use strict';

const fs = require('fs');
const path = require('path');
const { client: redis } = require('../../config/redis');
const { Token } = require('../../models/Token');
const { Organization } = require('../../models/Organization');
const { AppError } = require('../../middleware/errorHandler');
const { recordHistory, tokenExpiryKey, tokenStateKey } = require('../token/token.service');
const { emitToPatient, emitToQueue } = require('../../config/socket');
const logger = require('../../utils/logger');

// ── Load Lua scripts ───────────────────────────────────────────────────────
const checkInScript = fs.readFileSync(
  path.join(__dirname, '../../scripts/lua/checkIn.lua'),
  'utf8'
);

/**
 * Physical check-in via staff/kiosk scanning patient's token QR (spec §9, option 2).
 *
 * Steps:
 *  1. Validate token exists + is RESERVED
 *  2. Run atomic Lua script to check expiry + flip state in Redis
 *  3. On success: update MongoDB to CHECKED_IN, record history, emit events
 *  4. On expiry: update MongoDB to EXPIRED (if not already), release capacity
 */
const checkIn = async ({ tokenId, scannedBy }) => {
  const token = await Token.findById(tokenId)
    .populate('serviceId', 'name')
    .populate('patientId', 'name phone');

  if (!token) throw new AppError('Token not found', 404);
  if (token.status === 'CHECKED_IN' || token.status === 'WAITING') {
    // Already checked in — idempotent success
    return formatCheckInResult(token, 'already_checked_in');
  }
  if (token.status !== 'RESERVED') {
    throw new AppError(`Token cannot be checked in from state: ${token.status}`, 400);
  }

  const nowMs = Date.now().toString();
  const stateTTL = 86400; // 24 hours

  // Atomic Lua check: read expiry, flip state
  const luaResult = await redis.eval(
    checkInScript,
    2,
    tokenExpiryKey(tokenId),
    tokenStateKey(tokenId),
    nowMs,
    stateTTL
  );

  if (luaResult === -1) {
    // Expired — ensure DB is also updated
    if (token.status === 'RESERVED') {
      token.status = 'EXPIRED';
      await token.save();
      await recordHistory(
        token._id, token.orgId, token.patientId._id,
        'RESERVED', 'EXPIRED', 'SYSTEM', null,
        'Reservation expired at check-in attempt'
      );
      emitToPatient(token.patientId._id.toString(), 'token:expired', {
        tokenId,
        message: 'Your reservation expired. Please ask reception for a new token.',
      });
    }
    throw new AppError(
      `Reservation expired at ${token.reservationExpiresAt?.toISOString()}. Ask reception for a new token.`,
      410
    );
  }

  if (luaResult === -2) {
    // Redis expiry key not found — do a DB-level expiry check as fallback
    if (token.reservationExpiresAt && Date.now() > token.reservationExpiresAt.getTime()) {
      token.status = 'EXPIRED';
      await token.save();
      throw new AppError('Reservation expired. Ask reception for a new token.', 410);
    }
    // If not expired: continue (Redis key may have been evicted but token is valid)
  }

  // Success: update MongoDB
  const prevStatus = token.status;
  token.status = 'WAITING';
  token.checkedInAt = new Date();
  await token.save();

  await recordHistory(
    token._id, token.orgId, token.patientId._id,
    prevStatus, 'WAITING', 'STAFF', scannedBy,
    'Physical check-in via staff scan'
  );

  // Notify patient
  emitToPatient(token.patientId._id.toString(), 'token:checked_in', {
    tokenId,
    tokenNumber: token.tokenNumber,
    status: 'WAITING',
    checkedInAt: token.checkedInAt,
    message: 'You have checked in successfully. Please wait to be called.',
  });

  // Notify queue console
  emitToQueue(token.orgId.toString(), token.serviceId._id.toString(), 'queue:patient_arrived', {
    tokenId,
    tokenNumber: token.tokenNumber,
    patientName: token.patientId.name,
    checkedInAt: token.checkedInAt,
  });

  logger.info(`Check-in: token ${tokenId} (${token.tokenNumber}) — patient ${token.patientId._id}`);

  return formatCheckInResult(token, 'checked_in');
};

/**
 * Manual check-in by receptionist (no QR scan required).
 * Validates token by tokenNumber + serviceDate.
 */
const manualCheckIn = async ({ tokenNumber, serviceId, orgId, scannedBy }) => {
  const today = new Date().toISOString().slice(0, 10);
  const token = await Token.findOne({ tokenNumber, serviceId, orgId, serviceDate: today });
  if (!token) throw new AppError('Token not found for today', 404);
  return checkIn({ tokenId: token._id.toString(), scannedBy });
};

const formatCheckInResult = (token, result) => ({
  result,
  tokenId: token._id,
  tokenNumber: token.tokenNumber,
  status: token.status,
  checkedInAt: token.checkedInAt,
  patient: token.patientId,
  service: token.serviceId,
});

module.exports = { checkIn, manualCheckIn };

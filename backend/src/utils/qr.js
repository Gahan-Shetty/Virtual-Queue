'use strict';

const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { client: redis } = require('../config/redis');

const QR_SESSION_TTL = 60; // seconds — how long a location QR code stays valid

/**
 * Generate a QR code as a base64 data URL for a given payload string.
 */
const generateQRDataURL = async (payload) => {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
  });
};

/**
 * Generate a patient token QR payload (non-expiring — links to token ID).
 * Staff/kiosk scans this to verify the patient is physically present.
 * @param {string} tokenId - MongoDB token _id
 * @returns {Promise<string>} base64 data URL
 */
const generatePatientTokenQR = async (tokenId) => {
  const payload = JSON.stringify({ type: 'TOKEN_CHECKIN', tokenId });
  return generateQRDataURL(payload);
};

/**
 * Generate a rotating location QR (displayed at entrance).
 * Creates a short-lived session key in Redis.
 * Note (spec §9): This is treated as a UX convenience layer, NOT the security boundary.
 * The security boundary is staff/kiosk scanning the patient's personal token QR.
 *
 * @param {string} orgId
 * @param {string} locationId - physical entrance/gate identifier
 * @returns {Promise<{qrDataUrl: string, sessionKey: string, expiresAt: Date}>}
 */
const generateLocationQR = async (orgId, locationId) => {
  const sessionKey = uuidv4();
  const redisKey = `qr:location:${orgId}:${locationId}:${sessionKey}`;
  await redis.setex(redisKey, QR_SESSION_TTL, JSON.stringify({ orgId, locationId, createdAt: Date.now() }));

  const payload = JSON.stringify({ type: 'LOCATION_CHECKIN', orgId, locationId, sessionKey });
  const qrDataUrl = await generateQRDataURL(payload);
  const expiresAt = new Date(Date.now() + QR_SESSION_TTL * 1000);
  return { qrDataUrl, sessionKey, expiresAt };
};

/**
 * Validate a location QR session key (check it still exists in Redis).
 */
const validateLocationQRSession = async (orgId, locationId, sessionKey) => {
  const redisKey = `qr:location:${orgId}:${locationId}:${sessionKey}`;
  const data = await redis.get(redisKey);
  return data ? JSON.parse(data) : null;
};

module.exports = {
  generatePatientTokenQR,
  generateLocationQR,
  validateLocationQRSession,
};

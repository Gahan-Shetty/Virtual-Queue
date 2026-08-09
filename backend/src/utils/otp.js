'use strict';

const crypto = require('crypto');
const { client: redis } = require('../config/redis');
const env = require('../config/env');

const OTP_TTL_SECONDS = (env.OTP_EXPIRES_MINUTES || 10) * 60;

/**
 * Generate a 6-digit numeric OTP and store it in Redis with a TTL.
 * Key: otp:{purpose}:{identifier}
 */
const generateOtp = async (identifier, purpose = 'verify') => {
  const otp = crypto.randomInt(100000, 999999).toString();
  const key = `otp:${purpose}:${identifier}`;
  await redis.setex(key, OTP_TTL_SECONDS, otp);
  return otp;
};

/**
 * Verify an OTP. Deletes the key on success (single use).
 */
const verifyOtp = async (identifier, otp, purpose = 'verify') => {
  const key = `otp:${purpose}:${identifier}`;
  const stored = await redis.get(key);
  if (!stored) return { valid: false, reason: 'OTP expired or not found' };
  if (stored !== otp) return { valid: false, reason: 'Invalid OTP' };
  await redis.del(key);
  return { valid: true };
};

module.exports = { generateOtp, verifyOtp };

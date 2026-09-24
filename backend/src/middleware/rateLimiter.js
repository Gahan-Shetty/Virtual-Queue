'use strict';

const rateLimit = require('express-rate-limit');
const { client: redis } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Custom Redis store for express-rate-limit.
 * Allows rate limit counters to be shared across multiple server processes.
 */
class RedisStore {
  constructor(prefix = 'rl') {
    this.prefix = prefix;
  }

  async increment(key) {
    const redisKey = `${this.prefix}:${key}`;
    const current = await redis.incr(redisKey);
    if (current === 1) {
      // First request in this window — set TTL
      await redis.expire(redisKey, this.windowSeconds || 900);
    }
    const ttl = await redis.ttl(redisKey);
    return {
      totalHits: current,
      resetTime: new Date(Date.now() + ttl * 1000),
    };
  }

  async decrement(key) {
    const redisKey = `${this.prefix}:${key}`;
    await redis.decr(redisKey);
  }

  async resetKey(key) {
    const redisKey = `${this.prefix}:${key}`;
    await redis.del(redisKey);
  }
}

/**
 * Factory: create a rate limiter with given parameters.
 */
const createLimiter = ({ windowMinutes = 15, max = 100, prefix = 'rl:general', message = 'Too many requests, please try again later.' } = {}) => {
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    return (req, res, next) => next();
  }

  const store = new RedisStore(prefix);
  store.windowSeconds = windowMinutes * 60;

  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    message: { success: false, message },
    standardHeaders: true,
    legacyHeaders: false,
    store,
    handler: (req, res, next, options) => {
      logger.warn(`Rate limit hit: ${req.ip} on ${req.path}`);
      res.status(429).json({ success: false, message: options.message.message });
    },
  });
};

// ── Preset limiters ────────────────────────────────────────────────────────

/** Global API rate limit */
const globalLimiter = createLimiter({
  windowMinutes: 15,
  max: 200,
  prefix: 'rl:global',
  message: 'Too many requests from this IP, please try again in 15 minutes.',
});

/** Auth endpoints (login, register) — tighter limit */
const authLimiter = createLimiter({
  windowMinutes: 15,
  max: 20,
  prefix: 'rl:auth',
  message: 'Too many authentication attempts, please try again in 15 minutes.',
});

/** Token request endpoint — strict per spec §6 */
const tokenRequestLimiter = createLimiter({
  windowMinutes: 60,
  max: 10,
  prefix: 'rl:token-request',
  message: 'Too many token requests from this IP.',
});

/** OTP send/verify endpoints */
const otpLimiter = createLimiter({
  windowMinutes: 10,
  max: 5,
  prefix: 'rl:otp',
  message: 'Too many OTP attempts, please try again in 10 minutes.',
});

module.exports = { globalLimiter, authLimiter, tokenRequestLimiter, otpLimiter, createLimiter };

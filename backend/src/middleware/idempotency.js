'use strict';

const { client: redis } = require('../config/redis');
const response = require('../utils/apiResponse');
const logger = require('../utils/logger');

const IDEMPOTENCY_TTL = 86400; // 24 hours — idempotency keys expire after one day

/**
 * Idempotency middleware (spec §6).
 *
 * Requires an `Idempotency-Key` header (client-generated UUID) on mutating requests.
 * On first request: stores the eventual response in Redis after the handler runs.
 * On retry with same key: returns the cached response without re-running the handler.
 *
 * This protects against the classic double-click / retry-on-timeout scenario where
 * the DB uniqueness constraint alone is insufficient (race between two in-flight requests).
 *
 * Apply only to POST routes where duplicate execution would be harmful (e.g. token requests).
 */
const idempotency = async (req, res, next) => {
  const key = req.headers['idempotency-key'];

  if (!key) {
    return response.badRequest(res, 'Idempotency-Key header is required for this request');
  }

  if (!/^[0-9a-f-]{36}$/i.test(key)) {
    return response.badRequest(res, 'Idempotency-Key must be a valid UUID v4');
  }

  const redisKey = `idempotency:${req.user?.orgId || 'global'}:${req.user?.id || 'anon'}:${key}`;

  try {
    const cached = await redis.get(redisKey);

    if (cached) {
      logger.info(`Idempotency cache hit: ${key}`);
      const parsed = JSON.parse(cached);
      // Return the exact same status + body as the original request
      return res.status(parsed.status).json(parsed.body);
    }

    // Intercept the response to cache it after the handler runs
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      // Only cache successful or well-known error responses (not 5xx)
      if (res.statusCode < 500) {
        await redis.setex(redisKey, IDEMPOTENCY_TTL, JSON.stringify({ status: res.statusCode, body }));
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    logger.error(`Idempotency middleware error: ${err.message}`);
    // On Redis failure, fall through rather than blocking the request
    next();
  }
};

module.exports = { idempotency };

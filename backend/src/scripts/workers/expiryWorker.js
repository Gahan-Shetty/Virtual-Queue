'use strict';

const { Worker, Queue } = require('bullmq');
const { Token } = require('../../models/Token');
const { TokenHistory } = require('../../models/TokenHistory');
const { client: redis } = require('../../config/redis');
const { capacityKey } = require('../../modules/token/token.service');
const { emitToPatient } = require('../../config/socket');
const logger = require('../../utils/logger');
const env = require('../../config/env');

const QUEUE_NAME = 'expiry-sweep';

/**
 * Expiry Worker — BullMQ recurring job (spec §8).
 * Polls every EXPIRY_POLL_INTERVAL_SECONDS for RESERVED tokens past their expiry time.
 * Transitions them to EXPIRED and releases capacity back to the pool.
 *
 * Design choice: polling worker rather than reactive-at-read-time checking.
 * Capacity release lag ≤ polling interval (~30s). Tokens are also filtered
 * reactively at read time so patients never see a stale state.
 *
 * Race condition guard: the checkIn.lua script resolves any TOCTOU race between
 * check-in and this sweep atomically. This worker only processes tokens that are
 * already confirmed expired by the Lua script or by DB timestamp comparison.
 */

let worker = null;
let sweepQueue = null;

const processSweep = async () => {
  const now = new Date();

  // Find all RESERVED tokens whose reservationExpiresAt has passed
  const expired = await Token.find({
    status: 'RESERVED',
    reservationExpiresAt: { $lte: now },
  }).limit(500); // process in batches

  if (expired.length === 0) return;

  logger.info(`Expiry worker: found ${expired.length} expired reservations`);

  for (const token of expired) {
    try {
      // Double-check status hasn't changed (could have been checked in between query and now)
      const fresh = await Token.findById(token._id);
      if (!fresh || fresh.status !== 'RESERVED') continue;

      // Flip to EXPIRED
      fresh.status = 'EXPIRED';
      await fresh.save();

      // Release capacity
      const capKey = capacityKey(
        fresh.orgId.toString(),
        fresh.serviceId.toString(),
        fresh.serviceDate,
        fresh.source
      );
      const current = await redis.get(capKey);
      if (current && parseInt(current) > 0) {
        await redis.decr(capKey);
      }

      // Clear expiry key from Redis (if still present)
      await redis.del(`token:expiry:${fresh._id}`);

      // Record history
      await TokenHistory.create({
        tokenId: fresh._id,
        orgId: fresh.orgId,
        patientId: fresh.patientId,
        fromStatus: 'RESERVED',
        toStatus: 'EXPIRED',
        timestamp: now,
        triggeredBy: 'SYSTEM',
        triggeredById: null,
        reason: `Reservation expired at ${fresh.reservationExpiresAt?.toISOString()}`,
      });

      // Notify patient
      emitToPatient(fresh.patientId.toString(), 'token:expired', {
        tokenId: fresh._id,
        tokenNumber: fresh.tokenNumber,
        message: `Your reservation (${fresh.tokenNumber}) expired at ${fresh.reservationExpiresAt?.toLocaleTimeString()}. Ask reception for a new token.`,
      });

      logger.info(`Expired: token ${fresh._id} (${fresh.tokenNumber})`);
    } catch (err) {
      logger.error(`Expiry worker error for token ${token._id}: ${err.message}`);
    }
  }
};

const start = async () => {
  // Create a repeating job
  sweepQueue = new Queue(QUEUE_NAME, { connection: redis });

  // Remove old repeatable jobs and add fresh one
  const repeatable = await sweepQueue.getRepeatableJobs();
  for (const job of repeatable) {
    await sweepQueue.removeRepeatableByKey(job.key);
  }

  const intervalMs = (env.EXPIRY_POLL_INTERVAL_SECONDS || 30) * 1000;
  await sweepQueue.add('sweep', {}, { repeat: { every: intervalMs } });

  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await processSweep();
    },
    {
      connection: redis,
      concurrency: 1,
    }
  );

  worker.on('completed', () => logger.debug('Expiry sweep completed'));
  worker.on('failed', (job, err) => logger.error(`Expiry sweep failed: ${err.message}`));

  logger.info(`Expiry worker started (interval: ${env.EXPIRY_POLL_INTERVAL_SECONDS}s)`);
};

const stop = async () => {
  if (worker) await worker.close();
  if (sweepQueue) await sweepQueue.close();
  logger.info('Expiry worker stopped');
};

module.exports = { start, stop };

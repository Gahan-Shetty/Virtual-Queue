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

// BullMQ requires maxRetriesPerRequest to be null for Workers.
const bullmqConnection = {
  host: env.REDIS_HOST || '127.0.0.1',
  port: Number(env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
};

const processSweep = async () => {
  const now = new Date();

  const expired = await Token.find({
    status: 'RESERVED',
    reservationExpiresAt: { $lte: now },
  }).limit(500);

  if (expired.length === 0) return;

  logger.info(
    `Expiry worker: found ${expired.length} expired reservations`
  );

  for (const token of expired) {
    try {
      // Double-check current status before expiring.
      const fresh = await Token.findById(token._id);

      if (!fresh || fresh.status !== 'RESERVED') {
        continue;
      }

      // Mark token as expired.
      fresh.status = 'EXPIRED';
      await fresh.save();

      // Release capacity.
      const capKey = capacityKey(
        fresh.orgId.toString(),
        fresh.serviceId.toString(),
        fresh.serviceDate,
        fresh.source
      );

      const current = await redis.get(capKey);

      if (current && parseInt(current, 10) > 0) {
        await redis.decr(capKey);
      }

      // Remove expiry key.
      await redis.del(`token:expiry:${fresh._id}`);

      // Record history.
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

      // Notify patient.
      emitToPatient(
        fresh.patientId.toString(),
        'token:expired',
        {
          tokenId: fresh._id,
          tokenNumber: fresh.tokenNumber,
          message: `Your reservation (${fresh.tokenNumber}) expired at ${fresh.reservationExpiresAt?.toLocaleTimeString()}. Ask reception for a new token.`,
        }
      );

      // Notify admin dashboard.
      const { emitToAdmin } = require('../../config/socket');
      emitToAdmin(fresh.orgId.toString(), 'admin:stats_updated', { tokenId: fresh._id });

      logger.info(
        `Expired: token ${fresh._id} (${fresh.tokenNumber})`
      );
    } catch (err) {
      logger.error(
        `Expiry worker error for token ${token._id}: ${err.message}`
      );
    }
  }
};

const start = async () => {
  // Queue uses BullMQ-specific Redis connection.
  const sweepQueue = new Queue(QUEUE_NAME, {
    connection: bullmqConnection,
  });

  const intervalMs =
    (env.EXPIRY_POLL_INTERVAL_SECONDS || 30) * 1000;

  // BullMQ 6.x Job Scheduler.
  await sweepQueue.upsertJobScheduler(
    'expiry-sweep-scheduler',
    {
      every: intervalMs,
    },
    {
      name: 'sweep',
      data: {},
    }
  );

  // Worker uses the required maxRetriesPerRequest: null.
  worker = new Worker(
    QUEUE_NAME,
    async () => {
      await processSweep();
    },
    {
      connection: bullmqConnection,
      concurrency: 1,
    }
  );

  worker.on('completed', () => {
    logger.debug('Expiry sweep completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(`Expiry sweep failed: ${err.message}`);
  });

  logger.info(
    `Expiry worker started (interval: ${
      env.EXPIRY_POLL_INTERVAL_SECONDS || 30
    }s)`
  );

  // Store queue reference for graceful shutdown.
  sweepQueueRef = sweepQueue;
};

let worker = null;
let sweepQueueRef = null;

const stop = async () => {
  if (worker) {
    await worker.close();
    worker = null;
  }

  if (sweepQueueRef) {
    await sweepQueueRef.close();
    sweepQueueRef = null;
  }

  logger.info('Expiry worker stopped');
};

module.exports = {
  start,
  stop,
};
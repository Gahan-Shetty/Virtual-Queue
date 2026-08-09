'use strict';

const { Token } = require('../../models/Token');
const { Counter } = require('../../models/Counter');
const { Organization } = require('../../models/Organization');
const { User } = require('../../models/User');
const { AppError } = require('../../middleware/errorHandler');
const { recordHistory, capacityKey, todayUTC } = require('../token/token.service');
const { emitToPatient, emitToQueue, emitToAdmin } = require('../../config/socket');
const { client: redis } = require('../../config/redis');
const logger = require('../../utils/logger');

/**
 * Call the next patient in the queue for a given service + counter.
 * Queue ordering: WAITING tokens sorted by checkedInAt asc (spec §12 fairness).
 * counterId assigned at call time (spec §17 CALL_TIME policy).
 */
const callNext = async ({ orgId, serviceId, counterId, calledBy }) => {
  // Verify counter belongs to this service
  const counter = await Counter.findOne({ _id: counterId, serviceId, orgId, isActive: true });
  if (!counter) throw new AppError('Counter not found or inactive', 404);

  if (counter.status === 'SERVING') {
    throw new AppError('This counter is currently serving a patient. Complete or mark no-show first.', 409);
  }

  // Get next WAITING token (check-in timestamp order)
  const nextToken = await Token.findOne({
    orgId,
    serviceId,
    serviceDate: todayUTC(),
    status: 'WAITING',
  })
    .sort({ checkedInAt: 1 })
    .populate('patientId', 'name phone');

  if (!nextToken) throw new AppError('No patients waiting in the queue', 404);

  // Assign counter + transition to CALLED
  const prev = nextToken.status;
  nextToken.status = 'CALLED';
  nextToken.calledAt = new Date();
  nextToken.counterId = counter._id;
  await nextToken.save();

  // Update counter
  counter.status = 'SERVING';
  counter.currentTokenId = nextToken._id;
  counter.currentTokenNumber = nextToken.tokenNumber;
  await counter.save();

  await recordHistory(
    nextToken._id, orgId, nextToken.patientId._id,
    prev, 'CALLED', 'STAFF', calledBy,
    `Called to counter: ${counter.name}`
  );

  // Load org for no-show grace period
  const org = await Organization.findById(orgId);
  const noShowGraceMs = (org?.noShowGracePeriodMinutes || 5) * 60 * 1000;

  // Notify patient (loud — they need to go to the counter now)
  emitToPatient(nextToken.patientId._id.toString(), 'token:called', {
    tokenId: nextToken._id,
    tokenNumber: nextToken.tokenNumber,
    counterName: counter.name,
    calledAt: nextToken.calledAt,
    noShowGraceMs,
    message: `Token ${nextToken.tokenNumber} — please proceed to ${counter.name} now.`,
  });

  // Notify queue console
  emitToQueue(orgId.toString(), serviceId.toString(), 'queue:called', {
    tokenId: nextToken._id,
    tokenNumber: nextToken.tokenNumber,
    patientName: nextToken.patientId.name,
    counterId,
    counterName: counter.name,
    calledAt: nextToken.calledAt,
  });

  logger.info(`Called: ${nextToken.tokenNumber} → counter ${counter.name} (by ${calledBy})`);

  return { token: nextToken, counter };
};

/**
 * Mark a called patient as SERVING (they have arrived at the counter).
 */
const markServing = async ({ tokenId, orgId, confirmedBy }) => {
  const token = await Token.findOne({ _id: tokenId, orgId }).populate('patientId', 'name');
  if (!token) throw new AppError('Token not found', 404);
  if (token.status !== 'CALLED') throw new AppError(`Token must be in CALLED state (currently: ${token.status})`, 400);

  const prev = token.status;
  token.status = 'SERVING';
  token.servingStartedAt = new Date();
  await token.save();

  await recordHistory(
    token._id, orgId, token.patientId._id,
    prev, 'SERVING', 'STAFF', confirmedBy
  );

  emitToPatient(token.patientId._id.toString(), 'token:serving', {
    tokenId,
    tokenNumber: token.tokenNumber,
    message: 'You are now being served.',
  });

  emitToQueue(orgId.toString(), token.serviceId.toString(), 'queue:serving', {
    tokenId,
    tokenNumber: token.tokenNumber,
  });

  return token;
};

/**
 * Complete service for the current token at a counter.
 */
const complete = async ({ tokenId, orgId, completedBy }) => {
  const token = await Token.findOne({ _id: tokenId, orgId }).populate('patientId', 'name');
  if (!token) throw new AppError('Token not found', 404);
  if (!['SERVING', 'CALLED'].includes(token.status)) {
    throw new AppError(`Token cannot be completed from state: ${token.status}`, 400);
  }

  const prev = token.status;
  token.status = 'COMPLETED';
  token.completedAt = new Date();
  await token.save();

  // Free the counter
  if (token.counterId) {
    await Counter.findByIdAndUpdate(token.counterId, {
      status: 'IDLE',
      currentTokenId: null,
      currentTokenNumber: null,
    });
  }

  await recordHistory(
    token._id, orgId, token.patientId._id,
    prev, 'COMPLETED', 'STAFF', completedBy
  );

  emitToPatient(token.patientId._id.toString(), 'token:completed', {
    tokenId,
    tokenNumber: token.tokenNumber,
    completedAt: token.completedAt,
    message: 'Service completed. Thank you for visiting.',
  });

  emitToQueue(orgId.toString(), token.serviceId.toString(), 'queue:completed', {
    tokenId,
    tokenNumber: token.tokenNumber,
    counterId: token.counterId,
  });

  logger.info(`Completed: ${token.tokenNumber} (by ${completedBy})`);
  return token;
};

/**
 * Mark a called patient as NO_SHOW (they did not arrive within the grace period).
 * Queue advances to next patient automatically via the next callNext() invocation.
 */
const markNoShow = async ({ tokenId, orgId, markedBy }) => {
  const token = await Token.findOne({ _id: tokenId, orgId }).populate('patientId', 'name');
  if (!token) throw new AppError('Token not found', 404);
  if (token.status !== 'CALLED') throw new AppError(`Token must be in CALLED state (currently: ${token.status})`, 400);

  const prev = token.status;
  token.status = 'NO_SHOW';
  await token.save();

  // Free the counter
  if (token.counterId) {
    await Counter.findByIdAndUpdate(token.counterId, {
      status: 'IDLE',
      currentTokenId: null,
      currentTokenNumber: null,
    });
  }

  await recordHistory(
    token._id, orgId, token.patientId._id,
    prev, 'NO_SHOW', 'STAFF', markedBy,
    'Patient did not respond when called'
  );

  emitToPatient(token.patientId._id.toString(), 'token:no_show', {
    tokenId,
    tokenNumber: token.tokenNumber,
    message: 'You were marked as no-show. Ask reception if you wish to rejoin.',
  });

  emitToQueue(orgId.toString(), token.serviceId.toString(), 'queue:no_show', {
    tokenId,
    tokenNumber: token.tokenNumber,
  });

  logger.info(`No-show: ${token.tokenNumber} (marked by ${markedBy})`);
  return token;
};

/**
 * Rejoin after NO_SHOW (spec §10).
 * Creates a NEW token (new capacity slot, new queue position).
 * Links noShowTokenRef → original NO_SHOW token for audit.
 * Enforces per-day rejoin cap.
 */
const rejoin = async ({ noShowTokenId, orgId, receptionistId }) => {
  const original = await Token.findOne({ _id: noShowTokenId, orgId });
  if (!original) throw new AppError('Original token not found', 404);
  if (original.status !== 'NO_SHOW') throw new AppError('Token is not in NO_SHOW state', 400);

  const patient = await User.findById(original.patientId);
  if (!patient) throw new AppError('Patient not found', 404);

  const org = await Organization.findById(orgId);
  const maxRejoins = org?.maxNoShowRejoinsPerDay || 1;

  // Check per-day rejoin cap
  const today = todayUTC();
  if (patient.noShowRejoinDate && patient.noShowRejoinDate.toISOString().slice(0, 10) === today) {
    if (patient.noShowRejoinCount >= maxRejoins) {
      throw new AppError(`No-show rejoin limit (${maxRejoins} per day) reached for this patient`, 429);
    }
    await User.findByIdAndUpdate(patient._id, { $inc: { noShowRejoinCount: 1 } });
  } else {
    // Reset counter for new day
    await User.findByIdAndUpdate(patient._id, { noShowRejoinCount: 1, noShowRejoinDate: new Date() });
  }

  // Create new token — uses walk-in logic (receptionist creates it)
  // noShowTokenRef links to original for audit trail
  const { requestToken } = require('../token/token.service');
  const { v4: uuidv4 } = require('uuid');

  const newToken = await requestToken(
    {
      serviceId: original.serviceId.toString(),
      idempotencyKey: uuidv4(), // new key — this is a genuinely new request
      source: 'WALK_IN',
      patientId: original.patientId.toString(),
    },
    { id: receptionistId, orgId, role: 'RECEPTIONIST' }
  );

  // Link to original no-show token
  await Token.findByIdAndUpdate(newToken._id || newToken.tokenId, { noShowTokenRef: noShowTokenId });

  logger.info(`Rejoin: new token created for NO_SHOW ${noShowTokenId}`);

  return newToken;
};

/**
 * Get live queue stats for a service.
 */
const getQueueStats = async (orgId, serviceId) => {
  const today = todayUTC();
  const [waiting, called, serving, completed, noShow, expired] = await Promise.all([
    Token.countDocuments({ orgId, serviceId, serviceDate: today, status: 'WAITING' }),
    Token.countDocuments({ orgId, serviceId, serviceDate: today, status: 'CALLED' }),
    Token.countDocuments({ orgId, serviceId, serviceDate: today, status: 'SERVING' }),
    Token.countDocuments({ orgId, serviceId, serviceDate: today, status: 'COMPLETED' }),
    Token.countDocuments({ orgId, serviceId, serviceDate: today, status: 'NO_SHOW' }),
    Token.countDocuments({ orgId, serviceId, serviceDate: today, status: 'EXPIRED' }),
  ]);

  return { waiting, called, serving, completed, noShow, expired, date: today };
};

module.exports = { callNext, markServing, complete, markNoShow, rejoin, getQueueStats };

'use strict';

const fs = require('fs');
const path = require('path');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { client: redis } = require('../../config/redis');
const { Token, ACTIVE_STATES } = require('../../models/Token');
const { TokenHistory } = require('../../models/TokenHistory');
const { Service } = require('../../models/Service');
const { Organization } = require('../../models/Organization');
const { User } = require('../../models/User');
const { AppError } = require('../../middleware/errorHandler');
const { emitToPatient, emitToQueue, emitToAdmin } = require('../../config/socket');
const logger = require('../../utils/logger');

// ── Load Lua scripts ───────────────────────────────────────────────────────
const allocateTokenScript = fs.readFileSync(
  path.join(__dirname, '../../scripts/lua/allocateToken.lua'),
  'utf8'
);

// ── Validation ─────────────────────────────────────────────────────────────
const requestTokenSchema = Joi.object({
  serviceId: Joi.string().required(),
  idempotencyKey: Joi.string().uuid().required(),
  source: Joi.string().valid('ONLINE', 'WALK_IN').default('ONLINE'),
  // For walk-in: receptionist provides patientId
  patientId: Joi.string().optional(),
});

// ── Redis Key Helpers ──────────────────────────────────────────────────────

const capacityKey = (orgId, serviceId, date, source) =>
  `cap:${orgId}:${serviceId}:${date}:${source}`;

const idempotencyLockKey = (orgId, idempotencyKey) =>
  `idem:${orgId}:${idempotencyKey}`;

const tokenExpiryKey = (tokenId) =>
  `token:expiry:${tokenId}`;

const tokenStateKey = (tokenId) =>
  `token:state:${tokenId}`;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Get today's date string in UTC: 'YYYY-MM-DD' */
const todayUTC = () => new Date().toISOString().slice(0, 10);

/** Check if current time falls within the org's booking window */
const isWithinBookingWindow = (org) => {
  const now = new Date();
  const [openH, openM] = org.bookingOpenTime.split(':').map(Number);
  const [closeH, closeM] = org.bookingCloseTime.split(':').map(Number);
  const openMs = (openH * 60 + openM) * 60000;
  const closeMs = (closeH * 60 + closeM) * 60000;
  const nowMs = (now.getHours() * 60 + now.getMinutes()) * 60000;
  return nowMs >= openMs && nowMs <= closeMs;
};

/** Resolve effective capacity for a service (per-service overrides org default) */
const resolveCapacity = (org, service) => ({
  online: service.onlineCapacity ?? org.onlineCapacity,
  walkIn: service.walkInCapacity ?? org.walkInCapacity,
});

/** Generate sequential token number: PREFIX + zero-padded number */
const buildTokenNumber = async (orgId, serviceId, serviceDate, prefix) => {
  const redisKey = `tokenseq:${orgId}:${serviceId}:${serviceDate}`;
  const results = await redis.multi().incr(redisKey).expire(redisKey, 86400).exec();
  const seq = results[0][1];
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

/** Calculate reservation expiry timestamp */
const calcReservationExpiry = (org) => {
  const now = new Date();
  const expiryMs = now.getTime() + org.reservationExpiryMinutes * 60 * 1000;
  // Add grace period on top
  const finalMs = expiryMs + org.checkInGracePeriodMinutes * 60 * 1000;
  return { expiresAt: new Date(expiryMs), finalExpiresAt: new Date(finalMs) };
};

/** Record a state transition in TokenHistory */
const recordHistory = async (tokenId, orgId, patientId, fromStatus, toStatus, triggeredBy, triggeredById, reason = null, meta = null) => {
  await TokenHistory.create({
    tokenId,
    orgId,
    patientId,
    fromStatus,
    toStatus,
    timestamp: new Date(),
    triggeredBy,
    triggeredById,
    reason,
    meta,
  });
};

// ── Main Service ───────────────────────────────────────────────────────────

/**
 * Request a token (online or walk-in).
 * Flow: validate → booking window check → duplicate check → capacity atomic allocation → create token
 */
const requestToken = async (body, requestingUser) => {
  const { error, value } = requestTokenSchema.validate(body);
  if (error) throw new AppError(error.details[0].message, 400);

  const { serviceId, idempotencyKey, source } = value;
  const orgId = requestingUser.orgId;

  // Determine patient: for WALK_IN, a receptionist can specify a patientId
  let patientId = requestingUser.id;
  if (source === 'WALK_IN' && value.patientId) {
    if (!['RECEPTIONIST', 'ADMIN'].includes(requestingUser.role)) {
      throw new AppError('Only receptionists can create walk-in tokens for other patients', 403);
    }
    patientId = value.patientId;
    // Verify patient exists and belongs to same org
    const patient = await User.findOne({ _id: patientId, orgId, role: 'PATIENT' });
    if (!patient) throw new AppError('Patient not found in this organization', 404);
  }

  // Only PATIENT role (or RECEPTIONIST for walk-in) can request tokens
  if (source === 'ONLINE' && requestingUser.role !== 'PATIENT') {
    throw new AppError('Only patients can request online tokens', 403);
  }
  if (source === 'ONLINE' && !requestingUser.isVerified) {
    throw new AppError('Account not verified. Please verify your email or phone before requesting a token.', 403);
  }

  // Load org + service
  const [org, service] = await Promise.all([
    Organization.findOne({ _id: orgId, isActive: true }),
    Service.findOne({ _id: serviceId, orgId, isActive: true }),
  ]);
  if (!org) throw new AppError('Organization not found', 404);
  if (!service) throw new AppError('Service not found or inactive', 404);

  const serviceDate = todayUTC();

  // Booking window check (spec §7) — only for ONLINE requests
  if (source === 'ONLINE' && !isWithinBookingWindow(org)) {
    throw new AppError(
      `Online booking is only available between ${org.bookingOpenTime} and ${org.bookingCloseTime}.`,
      400
    );
  }

  // Check for existing active token (idempotent: return existing rather than error)
  const existing = await Token.findOne({
    patientId,
    serviceId,
    serviceDate,
    orgId,
    status: { $in: ACTIVE_STATES },
  }).populate('serviceId', 'name tokenPrefix');

  if (existing) {
    logger.info(`Returning existing active token ${existing._id} for patient ${patientId}`);
    return formatToken(existing);
  }

  // Resolve capacity
  const capacity = resolveCapacity(org, service);
  const maxCap = source === 'ONLINE' ? capacity.online : capacity.walkIn;

  // Atomic capacity allocation via Lua script (spec §13)
  const capKey = capacityKey(orgId, serviceId, serviceDate, source);
  const idemKey = idempotencyLockKey(orgId, idempotencyKey);

  const [resultCode, currentCount] = await redis.eval(
    allocateTokenScript,
    2, // numkeys
    capKey,
    idemKey,
    maxCap,
    86400, // cap TTL: 24 hours
    86400  // idempotency TTL: 24 hours
  );

  if (resultCode === -2) {
    // Idempotency hit — the exact same request UUID was already processed.
    // Find and return that token.
    const idemToken = await Token.findOne({ idempotencyKey, orgId }).populate('serviceId', 'name tokenPrefix');
    if (idemToken) return formatToken(idemToken);
    throw new AppError('Duplicate request detected', 409);
  }

  if (resultCode === -1) {
    throw new AppError(
      `No capacity available for ${source === 'ONLINE' ? 'online reservations' : 'walk-in'} today. Daily limit reached.`,
      409
    );
  }

  // Allocation succeeded — create token in MongoDB
  const tokenNumber = await buildTokenNumber(orgId, serviceId, serviceDate, service.tokenPrefix);
  const { finalExpiresAt } = calcReservationExpiry(org);

  const token = await Token.create({
    tokenNumber,
    orgId,
    patientId,
    serviceId,
    source,
    status: 'RESERVED',
    serviceDate,
    idempotencyKey,
    reservationExpiresAt: finalExpiresAt,
    issuedBy: source === 'WALK_IN' ? requestingUser.id : null,
  });

  // Store expiry in Redis for the atomic check-in Lua script
  await redis.setex(
    tokenExpiryKey(token._id.toString()),
    Math.ceil((finalExpiresAt.getTime() - Date.now()) / 1000) + 60, // +60s buffer
    finalExpiresAt.getTime().toString()
  );

  // Audit trail
  await recordHistory(
    token._id,
    orgId,
    patientId,
    'NONE',
    'RESERVED',
    source === 'WALK_IN' ? 'STAFF' : 'PATIENT',
    requestingUser.id
  );

  // Real-time: notify patient
  emitToPatient(patientId, 'token:reserved', formatToken(token));

  // Real-time: notify queue staff
  emitToQueue(orgId, serviceId, 'queue:token_added', {
    tokenId: token._id,
    tokenNumber,
    source,
    patientId,
  });

  logger.info(`Token created: ${token._id} (${tokenNumber}) for patient ${patientId}, service ${serviceId}`);

  return formatToken(await token.populate('serviceId', 'name tokenPrefix'));
};

/**
 * Get a patient's active token for today.
 */
const getMyToken = async (patientId, orgId, serviceId = null) => {
  const query = { patientId, orgId, serviceDate: todayUTC(), status: { $in: ACTIVE_STATES } };
  if (serviceId) query.serviceId = serviceId;

  const token = await Token.findOne(query)
    .populate('serviceId', 'name tokenPrefix avgServiceTimeMinutes')
    .populate('counterId', 'name');

  if (!token) return null;

  // Enrich with queue position
  const position = await getQueuePosition(token._id.toString(), token.orgId.toString(), token.serviceId._id.toString(), token.serviceDate);

  return { ...formatToken(token), queuePosition: position };
};

/**
 * Get queue position of a token.
 * Position = count of WAITING/CHECKED_IN tokens ahead of this one (by checkedInAt).
 * Queue ordering is by check-in timestamp (spec §12 fairness policy).
 */
const getQueuePosition = async (tokenId, orgId, serviceId, serviceDate) => {
  const token = await Token.findById(tokenId);
  if (!token || !token.checkedInAt) return null; // Not yet in active queue

  const ahead = await Token.countDocuments({
    orgId,
    serviceId,
    serviceDate,
    status: { $in: ['CHECKED_IN', 'WAITING'] },
    checkedInAt: { $lt: token.checkedInAt },
  });

  return ahead + 1; // 1-indexed
};

/**
 * Cancel a token (patient or admin).
 */
const cancelToken = async (tokenId, requestingUser) => {
  const token = await Token.findOne({ _id: tokenId, orgId: requestingUser.orgId });
  if (!token) throw new AppError('Token not found', 404);

  // Only patient who owns it or admin/receptionist can cancel
  const isOwner = token.patientId.toString() === requestingUser.id;
  const isStaff = ['ADMIN', 'RECEPTIONIST'].includes(requestingUser.role);
  if (!isOwner && !isStaff) throw new AppError('You cannot cancel this token', 403);

  if (!ACTIVE_STATES.includes(token.status)) {
    throw new AppError(`Token is already in terminal state: ${token.status}`, 400);
  }
  if (['SERVING', 'CALLED'].includes(token.status)) {
    throw new AppError('Token is currently active with a staff member and cannot be cancelled by patient', 400);
  }

  const prev = token.status;
  token.status = 'CANCELLED';
  await token.save();

  // Release capacity in Redis
  const capKey = capacityKey(token.orgId.toString(), token.serviceId.toString(), token.serviceDate, token.source);
  await redis.decr(capKey);

  // Clear expiry key if still pending
  await redis.del(tokenExpiryKey(tokenId));

  await recordHistory(
    token._id,
    token.orgId,
    token.patientId,
    prev,
    'CANCELLED',
    isOwner ? 'PATIENT' : 'STAFF',
    requestingUser.id,
    'Cancelled by ' + (isOwner ? 'patient' : 'staff')
  );

  emitToPatient(token.patientId.toString(), 'token:cancelled', { tokenId });
  emitToQueue(token.orgId.toString(), token.serviceId.toString(), 'queue:token_removed', { tokenId });

  return { tokenId, status: 'CANCELLED' };
};

/**
 * Get all tokens for a service today (staff view).
 * Ordered by check-in timestamp for WAITING, creation for RESERVED.
 */
const getServiceQueue = async (orgId, serviceId, statuses = null) => {
  const query = {
    orgId,
    serviceId,
    serviceDate: todayUTC(),
  };
  if (statuses && statuses.length) {
    query.status = { $in: statuses };
  } else {
    query.status = { $in: ACTIVE_STATES };
  }

  const tokens = await Token.find(query)
    .populate('patientId', 'name phone')
    .populate('counterId', 'name')
    .sort({ checkedInAt: 1, createdAt: 1 });

  return tokens.map(formatToken);
};

/** Format token for API response */
const formatToken = (token) => {
  const obj = token.toObject ? token.toObject() : token;
  return obj;
};

module.exports = {
  requestToken,
  getMyToken,
  getQueuePosition,
  cancelToken,
  getServiceQueue,
  recordHistory,
  tokenExpiryKey,
  tokenStateKey,
  capacityKey,
  todayUTC,
};

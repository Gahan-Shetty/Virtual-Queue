'use strict';

const { Server } = require('socket.io');
const env = require('./env');
const logger = require('../utils/logger');
const { verifyAccessToken } = require('../utils/jwt');

let io;

/**
 * Initialise Socket.IO on the HTTP server.
 * Namespaces:
 *   /patient  — live queue position, token status for logged-in patients
 *   /staff    — queue console updates for staff/doctors
 *   /admin    — aggregate stats for admin dashboard
 */
const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── Authentication middleware (all namespaces) ──────────────────────────
  const authMiddleware = (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication required'));
    try {
      socket.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  };

  // ── Patient namespace ───────────────────────────────────────────────────
  const patientNS = io.of('/patient');
  patientNS.use(authMiddleware);
  patientNS.on('connection', (socket) => {
    logger.info(`[socket /patient] connected: ${socket.user.id}`);

    // Patient joins a room keyed by their userId so the server can push targeted updates
    socket.join(`patient:${socket.user.id}`);

    // On reconnect, the client should re-fetch state via REST; we just confirm connection
    socket.emit('connected', { userId: socket.user.id, timestamp: new Date().toISOString() });

    socket.on('disconnect', (reason) => {
      logger.info(`[socket /patient] disconnected: ${socket.user.id} (${reason})`);
    });
  });

  // ── Staff namespace ─────────────────────────────────────────────────────
  const staffNS = io.of('/staff');
  staffNS.use(authMiddleware);
  staffNS.on('connection', (socket) => {
    const { id, role, orgId, serviceId } = socket.user;
    logger.info(`[socket /staff] connected: ${id} (${role})`);

    // Staff joins org+service room to receive queue events
    if (orgId && serviceId) {
      socket.join(`queue:${orgId}:${serviceId}`);
    }

    socket.emit('connected', { userId: id, timestamp: new Date().toISOString() });

    socket.on('disconnect', (reason) => {
      logger.info(`[socket /staff] disconnected: ${id} (${reason})`);
    });
  });

  // ── Admin namespace ─────────────────────────────────────────────────────
  const adminNS = io.of('/admin');
  adminNS.use(authMiddleware);
  adminNS.on('connection', (socket) => {
    logger.info(`[socket /admin] connected: ${socket.user.id}`);
    socket.join(`admin:${socket.user.orgId}`);
    socket.emit('connected', { userId: socket.user.id, timestamp: new Date().toISOString() });

    socket.on('disconnect', () => {
      logger.info(`[socket /admin] disconnected: ${socket.user.id}`);
    });
  });

  logger.info('Socket.IO initialised (namespaces: /patient, /staff, /admin)');
  return io;
};

/** Emit a targeted event to a specific patient's socket room */
const emitToPatient = (userId, event, data) => {
  if (!io) return;
  io.of('/patient').to(`patient:${userId}`).emit(event, data);
};

/** Emit a queue update to all staff connected to a specific org+service queue */
const emitToQueue = (orgId, serviceId, event, data) => {
  if (!io) return;
  io.of('/staff').to(`queue:${orgId}:${serviceId}`).emit(event, data);
};

/** Emit to all admins of an org */
const emitToAdmin = (orgId, event, data) => {
  if (!io) return;
  io.of('/admin').to(`admin:${orgId}`).emit(event, data);
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialised');
  return io;
};

module.exports = { init, getIO, emitToPatient, emitToQueue, emitToAdmin };

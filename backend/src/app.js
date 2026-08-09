'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimiter');

// ── Route modules ──────────────────────────────────────────────────────────
const authRoutes = require('./modules/auth/auth.routes');
const tokenRoutes = require('./modules/token/token.routes');
const checkinRoutes = require('./modules/checkin/checkin.routes');
const queueRoutes = require('./modules/queue/queue.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const publicRoutes = require('./modules/public/public.routes');

const app = express();

// ── Security headers ───────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  })
);

// ── HTTP logging ───────────────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );
}

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Global rate limit ──────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: env.NODE_ENV });
});

// ── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);

// ── 404 + Global error handler ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;

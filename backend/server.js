'use strict';

const http = require('http');
const app = require('./src/app');
const { connect: connectDB } = require('./src/config/db');
const { connect: connectRedis } = require('./src/config/redis');
const socketConfig = require('./src/config/socket');
const expiryWorker = require('./src/scripts/workers/expiryWorker');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');

const server = http.createServer(app);

// Initialise Socket.IO
socketConfig.init(server);

// ── Graceful shutdown ──────────────────────────────────────────────────────

const shutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  await expiryWorker.stop();
  server.close(async () => {
    logger.info('HTTP server closed');
    const mongoose = require('mongoose');
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

// ── Bootstrap ──────────────────────────────────────────────────────────────

const start = async () => {
  try {
    logger.info('Starting Hybrid Queue System backend...');

    await connectDB();
    await connectRedis();

    // Start expiry worker after connections are ready
    await expiryWorker.start();

    server.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
      logger.info(`Health: http://localhost:${env.PORT}/health`);
    });
  } catch (err) {
    logger.error(`Startup failed: ${err.message}`, { stack: err.stack });
    process.exit(1);
  }
};

start();

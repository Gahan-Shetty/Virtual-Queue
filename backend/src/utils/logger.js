'use strict';

const winston = require('winston');
const env = require('../config/env');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    env.NODE_ENV === 'production'
      ? winston.format.json()
      : combine(colorize(), logFormat)
  ),
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

module.exports = logger;

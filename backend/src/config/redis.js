'use strict';

const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

const redisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  retryStrategy: (times) => {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  maxRetriesPerRequest: 3,
};

const client = new Redis(redisOptions);

client.on('connect', () => logger.info('Redis connected'));
client.on('ready', () => logger.info('Redis ready'));
client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
client.on('close', () => logger.warn('Redis connection closed'));
client.on('reconnecting', () => logger.warn('Redis reconnecting...'));

const connect = async () => {
  await client.connect();
};

module.exports = { client, connect };

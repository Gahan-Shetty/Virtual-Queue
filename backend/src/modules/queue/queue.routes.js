'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./queue.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

router.use(authenticate);

/** POST /api/queue/call-next — doctor/receptionist calls the next patient */
router.post('/call-next', authorize('DOCTOR', 'RECEPTIONIST', 'ADMIN'), controller.callNext);

/** PATCH /api/queue/:tokenId/serving — confirm patient has arrived at counter */
router.patch('/:tokenId/serving', authorize('DOCTOR', 'RECEPTIONIST', 'ADMIN'), controller.markServing);

/** PATCH /api/queue/:tokenId/complete — mark service as completed */
router.patch('/:tokenId/complete', authorize('DOCTOR', 'RECEPTIONIST', 'ADMIN'), controller.complete);

/** PATCH /api/queue/:tokenId/no-show — mark patient as no-show */
router.patch('/:tokenId/no-show', authorize('DOCTOR', 'RECEPTIONIST', 'ADMIN'), controller.markNoShow);

/** POST /api/queue/rejoin — receptionist creates new token after no-show */
router.post('/rejoin', authorize('RECEPTIONIST', 'ADMIN'), controller.rejoin);

/** GET /api/queue/stats — get live queue statistics */
router.get('/stats', authorize('DOCTOR', 'RECEPTIONIST', 'ADMIN'), controller.getStats);

module.exports = router;

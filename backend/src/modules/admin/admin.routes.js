'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./admin.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

router.use(authenticate, authorize('ADMIN'));

// Dashboard
router.get('/dashboard', controller.getDashboard);

// Staff
router.get('/staff', controller.listStaff);
router.post('/staff', controller.createStaff);
router.patch('/staff/:staffId', controller.updateStaff);
router.delete('/staff/:staffId', controller.deactivateStaff);

// Services
router.get('/services', controller.listServices);
router.post('/services', controller.createService);
router.patch('/services/:serviceId', controller.updateService);
router.delete('/services/:serviceId', controller.deleteService);

// Counters
router.get('/counters', controller.listCounters);
router.post('/counters', controller.createCounter);
router.patch('/counters/:counterId', controller.updateCounter);

// Org Config
router.get('/config', controller.getOrgConfig);
router.patch('/config', controller.updateOrgConfig);

module.exports = router;

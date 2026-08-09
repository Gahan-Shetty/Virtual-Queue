'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./admin.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');

router.use(authenticate);

const requireAdmin = authorize('ADMIN');
const requireStaffOrAdmin = authorize('ADMIN', 'DOCTOR', 'RECEPTIONIST');

// Dashboard
router.get('/dashboard', requireAdmin, controller.getDashboard);

// Staff
router.get('/staff', requireAdmin, controller.listStaff);
router.post('/staff', requireAdmin, controller.createStaff);
router.patch('/staff/:staffId', requireAdmin, controller.updateStaff);
router.delete('/staff/:staffId', requireAdmin, controller.deactivateStaff);

// Services
router.get('/services', requireStaffOrAdmin, controller.listServices);
router.post('/services', requireAdmin, controller.createService);
router.patch('/services/:serviceId', requireAdmin, controller.updateService);
router.delete('/services/:serviceId', requireAdmin, controller.deleteService);

// Counters
router.get('/counters', requireStaffOrAdmin, controller.listCounters);
router.post('/counters', requireAdmin, controller.createCounter);
router.patch('/counters/:counterId', requireAdmin, controller.updateCounter);

// Org Config
router.get('/config', requireAdmin, controller.getOrgConfig);
router.patch('/config', requireAdmin, controller.updateOrgConfig);

module.exports = router;

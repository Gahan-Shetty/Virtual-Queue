'use strict';

const adminService = require('./admin.service');
const response = require('../../utils/apiResponse');

// ── Staff ──────────────────────────────────────────────────────────────────
const createStaff = async (req, res, next) => {
  try {
    const staff = await adminService.createStaff(req.body, req.user);
    return response.created(res, staff, 'Staff account created');
  } catch (err) { next(err); }
};

const listStaff = async (req, res, next) => {
  try {
    const staff = await adminService.listStaff(req.user.orgId, req.query.role);
    return response.success(res, staff);
  } catch (err) { next(err); }
};

const updateStaff = async (req, res, next) => {
  try {
    const staff = await adminService.updateStaff(req.params.staffId, req.body, req.user);
    return response.success(res, staff, 'Staff updated');
  } catch (err) { next(err); }
};

const deactivateStaff = async (req, res, next) => {
  try {
    const result = await adminService.deactivateStaff(req.params.staffId, req.user);
    return response.success(res, result, 'Staff deactivated');
  } catch (err) { next(err); }
};

// ── Services ───────────────────────────────────────────────────────────────
const createService = async (req, res, next) => {
  try {
    const service = await adminService.createService(req.body, req.user);
    return response.created(res, service, 'Service created');
  } catch (err) { next(err); }
};

const listServices = async (req, res, next) => {
  try {
    const services = await adminService.listServices(req.user.orgId);
    return response.success(res, services);
  } catch (err) { next(err); }
};

const updateService = async (req, res, next) => {
  try {
    const service = await adminService.updateService(req.params.serviceId, req.body, req.user);
    return response.success(res, service, 'Service updated');
  } catch (err) { next(err); }
};

const deleteService = async (req, res, next) => {
  try {
    const result = await adminService.deleteService(req.params.serviceId, req.user);
    return response.success(res, result, 'Service deactivated');
  } catch (err) { next(err); }
};

// ── Counters ───────────────────────────────────────────────────────────────
const createCounter = async (req, res, next) => {
  try {
    const counter = await adminService.createCounter(req.body, req.user);
    return response.created(res, counter, 'Counter created');
  } catch (err) { next(err); }
};

const listCounters = async (req, res, next) => {
  try {
    const counters = await adminService.listCounters(req.user.orgId, req.query.serviceId);
    return response.success(res, counters);
  } catch (err) { next(err); }
};

const updateCounter = async (req, res, next) => {
  try {
    const counter = await adminService.updateCounter(req.params.counterId, req.body, req.user);
    return response.success(res, counter, 'Counter updated');
  } catch (err) { next(err); }
};

// ── Org Config ─────────────────────────────────────────────────────────────
const getOrgConfig = async (req, res, next) => {
  try {
    const config = await adminService.getOrgConfig(req.user.orgId);
    return response.success(res, config);
  } catch (err) { next(err); }
};

const updateOrgConfig = async (req, res, next) => {
  try {
    const config = await adminService.updateOrgConfig(req.body, req.user);
    return response.success(res, config, 'Configuration updated');
  } catch (err) { next(err); }
};

// ── Dashboard ──────────────────────────────────────────────────────────────
const getDashboard = async (req, res, next) => {
  try {
    const stats = await adminService.getDashboardStats(req.user.orgId);
    return response.success(res, stats);
  } catch (err) { next(err); }
};

module.exports = {
  createStaff, listStaff, updateStaff, deactivateStaff,
  createService, listServices, updateService, deleteService,
  createCounter, listCounters, updateCounter,
  getOrgConfig, updateOrgConfig,
  getDashboard,
};

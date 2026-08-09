'use strict';

const { User } = require('../../models/User');
const { Organization } = require('../../models/Organization');
const { Service } = require('../../models/Service');
const { Counter } = require('../../models/Counter');
const { Token } = require('../../models/Token');
const { AppError } = require('../../middleware/errorHandler');
const { emitToAdmin } = require('../../config/socket');
const { todayUTC } = require('../token/token.service');
const Joi = require('joi');
const logger = require('../../utils/logger');

// ── Staff Management ───────────────────────────────────────────────────────

const createStaffSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().min(7).max(20).required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid('RECEPTIONIST', 'DOCTOR').required(),
  serviceId: Joi.string().optional().allow(null),
  counterId: Joi.string().optional().allow(null),
});

const createStaff = async (body, adminUser) => {
  const { error, value } = createStaffSchema.validate(body);
  if (error) throw new AppError(error.details[0].message, 400);

  const existing = await User.findOne({ email: value.email, orgId: adminUser.orgId });
  if (existing) throw new AppError('Email already in use in this organization', 409);

  const passwordHash = await User.hashPassword(value.password);

  const staff = await User.create({
    ...value,
    passwordHash,
    orgId: adminUser.orgId,
    isVerified: true, // Staff accounts are pre-verified by admin
  });

  logger.info(`Staff created: ${staff._id} (${staff.role}) by admin ${adminUser.id}`);
  return staff.toSafeObject();
};

const listStaff = async (orgId, role = null) => {
  const query = { orgId, role: { $ne: 'PATIENT' }, isActive: true };
  if (role) query.role = role;
  return User.find(query).select('-passwordHash -refreshTokenHash').populate('serviceId', 'name').populate('counterId', 'name');
};

const updateStaff = async (staffId, body, adminUser) => {
  const staff = await User.findOne({ _id: staffId, orgId: adminUser.orgId });
  if (!staff || staff.role === 'PATIENT') throw new AppError('Staff not found', 404);
  if (staff._id.toString() === adminUser.id) throw new AppError('Cannot edit your own account via this endpoint', 400);

  const allowed = ['name', 'phone', 'serviceId', 'counterId', 'isActive'];
  const update = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  const updated = await User.findByIdAndUpdate(staffId, update, { new: true, runValidators: true });
  return updated.toSafeObject();
};

const deactivateStaff = async (staffId, adminUser) => {
  const staff = await User.findOne({ _id: staffId, orgId: adminUser.orgId });
  if (!staff || staff.role === 'PATIENT') throw new AppError('Staff not found', 404);
  staff.isActive = false;
  staff.refreshTokenHash = null; // force logout
  await staff.save();
  return { staffId, isActive: false };
};

// ── Service Management ─────────────────────────────────────────────────────

const serviceSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().allow('').optional(),
  dailyCapacity: Joi.number().integer().min(1).optional(),
  onlineCapacity: Joi.number().integer().min(0).optional(),
  walkInCapacity: Joi.number().integer().min(0).optional(),
  avgServiceTimeMinutes: Joi.number().min(1).optional(),
  tokenPrefix: Joi.string().max(5).optional(),
});

const createService = async (body, adminUser) => {
  const { error, value } = serviceSchema.validate(body);
  if (error) throw new AppError(error.details[0].message, 400);

  const service = await Service.create({ ...value, orgId: adminUser.orgId });
  logger.info(`Service created: ${service._id} (${service.name}) by admin ${adminUser.id}`);
  return service;
};

const listServices = async (orgId) => {
  return Service.find({ orgId, isActive: true }).sort({ name: 1 });
};

const updateService = async (serviceId, body, adminUser) => {
  const service = await Service.findOne({ _id: serviceId, orgId: adminUser.orgId });
  if (!service) throw new AppError('Service not found', 404);

  const { error, value } = serviceSchema.validate(body, { allowUnknown: false });
  if (error) throw new AppError(error.details[0].message, 400);

  // Grandfathering note: if onlineCapacity is lowered, existing RESERVED tokens are NOT invalidated.
  // The Lua script will see the new cap on the next request. (spec §7)
  Object.assign(service, value);
  await service.save();
  return service;
};

const deleteService = async (serviceId, adminUser) => {
  const service = await Service.findOne({ _id: serviceId, orgId: adminUser.orgId });
  if (!service) throw new AppError('Service not found', 404);
  service.isActive = false;
  await service.save();
  return { serviceId, isActive: false };
};

// ── Counter Management ─────────────────────────────────────────────────────

const counterSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  serviceId: Joi.string().required(),
  assignedStaffId: Joi.string().optional().allow(null),
});

const createCounter = async (body, adminUser) => {
  const { error, value } = counterSchema.validate(body);
  if (error) throw new AppError(error.details[0].message, 400);

  const service = await Service.findOne({ _id: value.serviceId, orgId: adminUser.orgId });
  if (!service) throw new AppError('Service not found', 404);

  const counter = await Counter.create({ ...value, orgId: adminUser.orgId });
  return counter;
};

const listCounters = async (orgId, serviceId = null) => {
  const query = { orgId, isActive: true };
  if (serviceId) query.serviceId = serviceId;
  return Counter.find(query).populate('assignedStaffId', 'name').populate('currentTokenId', 'tokenNumber status');
};

const updateCounter = async (counterId, body, adminUser) => {
  const counter = await Counter.findOne({ _id: counterId, orgId: adminUser.orgId });
  if (!counter) throw new AppError('Counter not found', 404);

  const allowed = ['name', 'assignedStaffId', 'isActive', 'status'];
  for (const key of allowed) {
    if (body[key] !== undefined) counter[key] = body[key];
  }
  await counter.save();
  return counter;
};

// ── Organization Config ────────────────────────────────────────────────────

const orgConfigSchema = Joi.object({
  bookingOpenTime: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  bookingCloseTime: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  serviceStartTime: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  serviceEndTime: Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  dailyCapacity: Joi.number().integer().min(1).optional(),
  onlineCapacity: Joi.number().integer().min(0).optional(),
  walkInCapacity: Joi.number().integer().min(0).optional(),
  reservationExpiryMinutes: Joi.number().min(1).optional(),
  checkInGracePeriodMinutes: Joi.number().min(0).optional(),
  noShowGracePeriodMinutes: Joi.number().min(0).optional(),
  maxNoShowRejoinsPerDay: Joi.number().integer().min(0).optional(),
});

const getOrgConfig = async (orgId) => {
  const org = await Organization.findById(orgId);
  if (!org) throw new AppError('Organization not found', 404);
  return org;
};

const updateOrgConfig = async (body, adminUser) => {
  const { error, value } = orgConfigSchema.validate(body);
  if (error) throw new AppError(error.details[0].message, 400);

  const org = await Organization.findByIdAndUpdate(adminUser.orgId, value, { new: true, runValidators: true });
  if (!org) throw new AppError('Organization not found', 404);

  emitToAdmin(adminUser.orgId, 'admin:config_updated', { config: org });
  logger.info(`Org config updated by admin ${adminUser.id}`);
  return org;
};

// ── Dashboard Stats ────────────────────────────────────────────────────────

const getDashboardStats = async (orgId) => {
  const today = todayUTC();
  const [total, completed, expired, noShow, waiting, serving] = await Promise.all([
    Token.countDocuments({ orgId, serviceDate: today }),
    Token.countDocuments({ orgId, serviceDate: today, status: 'COMPLETED' }),
    Token.countDocuments({ orgId, serviceDate: today, status: 'EXPIRED' }),
    Token.countDocuments({ orgId, serviceDate: today, status: 'NO_SHOW' }),
    Token.countDocuments({ orgId, serviceDate: today, status: 'WAITING' }),
    Token.countDocuments({ orgId, serviceDate: today, status: 'SERVING' }),
  ]);

  const patients = await User.countDocuments({ orgId, role: 'PATIENT', isActive: true });
  const staff = await User.countDocuments({ orgId, role: { $ne: 'PATIENT' }, isActive: true });

  return { date: today, total, completed, expired, noShow, waiting, serving, patients, staff };
};

module.exports = {
  createStaff, listStaff, updateStaff, deactivateStaff,
  createService, listServices, updateService, deleteService,
  createCounter, listCounters, updateCounter,
  getOrgConfig, updateOrgConfig,
  getDashboardStats,
};

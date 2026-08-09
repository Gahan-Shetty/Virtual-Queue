'use strict';

const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { User } = require('../../models/User');
const { Organization } = require('../../models/Organization');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../../utils/jwt');
const { generateOtp, verifyOtp: verifyOtpUtil } = require('../../utils/otp');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// ── Validation schemas ─────────────────────────────────────────────────────

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().min(7).max(20).required(),
  password: Joi.string().min(8).required(),
  orgSlug: Joi.string().required(), // Patient must know which org they're registering with
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  orgSlug: Joi.string().required(),
});

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(100),
  phone: Joi.string().min(7).max(20),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build JWT payload. orgId + serviceId + role are needed by socket.js
 * to place the user in the correct room on connection.
 */
const buildTokenPayload = (user) => ({
  id: user._id.toString(),
  role: user.role,
  orgId: user.orgId?.toString(),
  serviceId: user.serviceId?.toString() || null,
  counterId: user.counterId?.toString() || null,
  isVerified: user.isVerified,
});

// ── Service Methods ────────────────────────────────────────────────────────

const register = async (body) => {
  const { error, value } = registerSchema.validate(body);
  if (error) throw new AppError(error.details[0].message, 400);

  const { name, email, phone, password, orgSlug } = value;

  // Resolve org
  const org = await Organization.findOne({ slug: orgSlug, isActive: true });
  if (!org) throw new AppError('Organization not found', 404);

  // Check existing
  const existing = await User.findOne({ email, orgId: org._id });
  if (existing) throw new AppError('An account with this email already exists', 409);

  const passwordHash = await User.hashPassword(password);

  const user = await User.create({
    name,
    email,
    phone,
    passwordHash,
    role: 'PATIENT', // Patients self-register only as PATIENT (§2)
    orgId: org._id,
    isVerified: false,
  });

  logger.info(`New patient registered: ${user._id} (${email}) for org ${org.slug}`);

  const payload = buildTokenPayload(user);
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(user._id.toString());
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  await User.findByIdAndUpdate(user._id, { refreshTokenHash: refreshHash });

  return { user: user.toSafeObject(), accessToken, refreshToken };
};

const login = async (body) => {
  const { error, value } = loginSchema.validate(body);
  if (error) throw new AppError(error.details[0].message, 400);

  const { email, password, orgSlug } = value;

  const org = await Organization.findOne({ slug: orgSlug, isActive: true });
  if (!org) throw new AppError('Organization not found', 404);

  // Explicitly select passwordHash (excluded by default)
  const user = await User.findOne({ email, orgId: org._id, isActive: true }).select('+passwordHash +refreshTokenHash');
  if (!user) throw new AppError('Invalid email or password', 401);

  const valid = await user.comparePassword(password);
  if (!valid) throw new AppError('Invalid email or password', 401);

  const payload = buildTokenPayload(user);
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(user._id.toString());
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  await User.findByIdAndUpdate(user._id, { refreshTokenHash: refreshHash });

  logger.info(`Login: ${user._id} (${user.role}) for org ${org.slug}`);

  return { user: user.toSafeObject(), accessToken, refreshToken };
};

const refreshAccessToken = async (refreshToken) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await User.findById(decoded.id).select('+refreshTokenHash');
  if (!user || !user.refreshTokenHash) throw new AppError('Session expired, please login again', 401);

  const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!valid) throw new AppError('Invalid refresh token', 401);

  const payload = buildTokenPayload(user);
  const newAccessToken = generateAccessToken(payload);

  return { accessToken: newAccessToken };
};

const logout = async (userId) => {
  // Invalidate refresh token by clearing its hash
  await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
  logger.info(`Logout: ${userId}`);
};

const sendVerificationOtp = async (userId, via = 'email') => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const identifier = via === 'phone' ? user.phone : user.email;
  const otp = await generateOtp(identifier, 'verify');

  // In production: send via SMTP/SMS. For now, log it (stub).
  logger.info(`[OTP STUB] ${via.toUpperCase()} OTP for ${identifier}: ${otp}`);

  // TODO: replace stub with real email/SMS delivery
  // await emailService.sendOtp(user.email, otp);
};

const verifyAccountOtp = async (userId, otp, via = 'email') => {
  const user = await User.findById(userId);
  if (!user) throw new AppError('User not found', 404);

  const identifier = via === 'phone' ? user.phone : user.email;
  const { valid, reason } = await verifyOtpUtil(identifier, otp, 'verify');
  if (!valid) throw new AppError(reason, 400);

  await User.findByIdAndUpdate(userId, { isVerified: true });
  logger.info(`Account verified: ${userId} via ${via}`);
};

const getProfile = async (userId) => {
  const user = await User.findById(userId).populate('orgId', 'name slug').populate('serviceId', 'name').populate('counterId', 'name');
  if (!user) throw new AppError('User not found', 404);
  return user.toSafeObject();
};

const updateProfile = async (userId, body) => {
  const { error, value } = updateSchema.validate(body);
  if (error) throw new AppError(error.details[0].message, 400);

  const user = await User.findByIdAndUpdate(userId, value, { new: true, runValidators: true });
  if (!user) throw new AppError('User not found', 404);
  return user.toSafeObject();
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const { error } = changePasswordSchema.validate({ currentPassword, newPassword });
  if (error) throw new AppError(error.details[0].message, 400);

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new AppError('User not found', 404);

  const valid = await user.comparePassword(currentPassword);
  if (!valid) throw new AppError('Current password is incorrect', 400);

  const newHash = await User.hashPassword(newPassword);
  await User.findByIdAndUpdate(userId, { passwordHash: newHash, refreshTokenHash: null });
  logger.info(`Password changed: ${userId}`);
};

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  sendVerificationOtp,
  verifyAccountOtp,
  getProfile,
  updateProfile,
  changePassword,
};

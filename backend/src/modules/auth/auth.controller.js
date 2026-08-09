'use strict';

const authService = require('./auth.service');
const response = require('../../utils/apiResponse');
const logger = require('../../utils/logger');

const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    return response.created(res, result, 'Registration successful. Please verify your account.');
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    return response.success(res, result, 'Login successful');
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return response.badRequest(res, 'Refresh token required');
    const result = await authService.refreshAccessToken(refreshToken);
    return response.success(res, result, 'Token refreshed');
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user.id);
    return response.success(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

const sendOtp = async (req, res, next) => {
  try {
    const { via } = req.body; // 'email' | 'phone'
    await authService.sendVerificationOtp(req.user.id, via);
    return response.success(res, null, `OTP sent to your ${via || 'email'}`);
  } catch (err) {
    next(err);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { otp, via } = req.body;
    const result = await authService.verifyAccountOtp(req.user.id, otp, via);
    return response.success(res, result, 'Account verified successfully');
  } catch (err) {
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    return response.success(res, user);
  } catch (err) {
    next(err);
  }
};

const updateMe = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user.id, req.body);
    return response.success(res, user, 'Profile updated');
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    return response.success(res, null, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refreshToken, logout, sendOtp, verifyOtp, getMe, updateMe, changePassword };

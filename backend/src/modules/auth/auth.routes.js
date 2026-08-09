'use strict';

const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter, otpLimiter } = require('../../middleware/rateLimiter');

// ── Public Routes ──────────────────────────────────────────────────────────

/** POST /api/auth/register — patient self-registration */
router.post('/register', authLimiter, controller.register);

/** POST /api/auth/login — all roles */
router.post('/login', authLimiter, controller.login);

/** POST /api/auth/refresh — exchange refresh token for new access token */
router.post('/refresh', controller.refreshToken);

/** POST /api/auth/logout — revoke refresh token */
router.post('/logout', authenticate, controller.logout);

// ── OTP / Verification ─────────────────────────────────────────────────────

/** POST /api/auth/otp/send — send verification OTP to email or phone */
router.post('/otp/send', authenticate, otpLimiter, controller.sendOtp);

/** POST /api/auth/otp/verify — verify OTP and mark account as verified */
router.post('/otp/verify', authenticate, otpLimiter, controller.verifyOtp);

// ── Authenticated ─────────────────────────────────────────────────────────

/** GET /api/auth/me — return current user profile */
router.get('/me', authenticate, controller.getMe);

/** PATCH /api/auth/me — update name / phone */
router.patch('/me', authenticate, controller.updateMe);

/** POST /api/auth/change-password */
router.post('/change-password', authenticate, controller.changePassword);

module.exports = router;

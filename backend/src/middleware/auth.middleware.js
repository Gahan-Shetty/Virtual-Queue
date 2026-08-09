'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const { User } = require('../models/User');
const response = require('../utils/apiResponse');

/**
 * authenticate — verifies the JWT access token from Authorization header.
 * Attaches `req.user` with the full decoded payload.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.unauthorized(res, 'No token provided');
    }
    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return response.unauthorized(res, 'Token expired');
    }
    return response.unauthorized(res, 'Invalid token');
  }
};

/**
 * authorize — role-based guard. Pass one or more allowed roles.
 * Must be used AFTER authenticate.
 *
 * Usage: router.get('/admin-only', authenticate, authorize('ADMIN'), handler)
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return response.unauthorized(res);
    if (!allowedRoles.includes(req.user.role)) {
      return response.forbidden(res, `Access denied. Required role: ${allowedRoles.join(' or ')}`);
    }
    next();
  };
};

/**
 * requireVerified — ensures a patient account has verified contact info.
 * Must be used AFTER authenticate.
 */
const requireVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return response.forbidden(res, 'Account not verified. Please verify your email or phone first.');
  }
  next();
};

/**
 * requireSameOrg — prevents cross-org data access.
 * Checks that the orgId param in the URL matches the token's orgId.
 */
const requireSameOrg = (req, res, next) => {
  const { orgId } = req.params;
  if (orgId && orgId !== req.user.orgId?.toString()) {
    return response.forbidden(res, 'Cross-organization access denied');
  }
  next();
};

module.exports = { authenticate, authorize, requireVerified, requireSameOrg };

'use strict';

const checkInService = require('./checkin.service');
const { validateLocationQRSession } = require('../../utils/qr');
const { Token } = require('../../models/Token');
const response = require('../../utils/apiResponse');
const { AppError } = require('../../middleware/errorHandler');

/** Staff/kiosk scans patient's personal token QR (spec §9 option 2 — primary security boundary) */
const qrCheckIn = async (req, res, next) => {
  try {
    const { tokenId } = req.body;
    if (!tokenId) return response.badRequest(res, 'tokenId is required');

    const result = await checkInService.checkIn({ tokenId, scannedBy: req.user.id });
    return response.success(res, result, 'Patient checked in successfully');
  } catch (err) {
    next(err);
  }
};

/** Receptionist manually checks in a patient by token number */
const manualCheckIn = async (req, res, next) => {
  try {
    const { tokenNumber, serviceId } = req.body;
    if (!tokenNumber || !serviceId) return response.badRequest(res, 'tokenNumber and serviceId are required');

    const result = await checkInService.manualCheckIn({
      tokenNumber,
      serviceId,
      orgId: req.user.orgId,
      scannedBy: req.user.id,
    });
    return response.success(res, result, 'Patient checked in');
  } catch (err) {
    next(err);
  }
};

/**
 * Patient self-check-in using a rotating location QR (spec §9 option 1 — UX convenience layer).
 * Validates the location QR session, then delegates to checkIn.
 */
const selfCheckIn = async (req, res, next) => {
  try {
    const { tokenId, locationId, sessionKey } = req.body;
    if (!tokenId || !locationId || !sessionKey) {
      return response.badRequest(res, 'tokenId, locationId, and sessionKey are required');
    }

    // Validate token belongs to this patient
    const token = await Token.findOne({ _id: tokenId, patientId: req.user.id, orgId: req.user.orgId });
    if (!token) return response.notFound(res, 'Token not found');

    // Validate the location QR session is still active in Redis
    const session = await validateLocationQRSession(req.user.orgId, locationId, sessionKey);
    if (!session) {
      return response.badRequest(res, 'QR code has expired. Please scan the latest QR displayed at the entrance.');
    }

    const result = await checkInService.checkIn({ tokenId, scannedBy: req.user.id });
    return response.success(res, result, 'Check-in successful');
  } catch (err) {
    next(err);
  }
};

module.exports = { qrCheckIn, manualCheckIn, selfCheckIn };

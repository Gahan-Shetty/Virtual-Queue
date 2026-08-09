'use strict';

const tokenService = require('./token.service');
const { Token } = require('../../models/Token');
const { generatePatientTokenQR } = require('../../utils/qr');
const response = require('../../utils/apiResponse');

const requestToken = async (req, res, next) => {
  try {
    const token = await tokenService.requestToken(req.body, req.user);
    return response.created(res, token, 'Token reserved successfully');
  } catch (err) {
    next(err);
  }
};

const getMyToken = async (req, res, next) => {
  try {
    const { serviceId } = req.query;
    const token = await tokenService.getMyToken(req.user.id, req.user.orgId, serviceId);
    return response.success(res, token);
  } catch (err) {
    next(err);
  }
};

const getToken = async (req, res, next) => {
  try {
    const token = await Token.findOne({ _id: req.params.tokenId, orgId: req.user.orgId })
      .populate('patientId', 'name phone')
      .populate('serviceId', 'name tokenPrefix')
      .populate('counterId', 'name');

    if (!token) return response.notFound(res, 'Token not found');

    // Patients can only view their own tokens
    if (req.user.role === 'PATIENT' && token.patientId._id.toString() !== req.user.id) {
      return response.forbidden(res);
    }

    const position = await tokenService.getQueuePosition(
      token._id.toString(),
      token.orgId.toString(),
      token.serviceId._id.toString(),
      token.serviceDate
    );

    return response.success(res, { ...token.toObject(), queuePosition: position });
  } catch (err) {
    next(err);
  }
};

const getTokenQR = async (req, res, next) => {
  try {
    const token = await Token.findOne({ _id: req.params.tokenId, orgId: req.user.orgId });
    if (!token) return response.notFound(res, 'Token not found');

    // Only patient who owns it, or staff, can get the QR
    if (req.user.role === 'PATIENT' && token.patientId.toString() !== req.user.id) {
      return response.forbidden(res);
    }

    const qrDataUrl = await generatePatientTokenQR(token._id.toString());
    return response.success(res, { qrDataUrl, tokenId: token._id, tokenNumber: token.tokenNumber });
  } catch (err) {
    next(err);
  }
};

const cancelToken = async (req, res, next) => {
  try {
    const result = await tokenService.cancelToken(req.params.tokenId, req.user);
    return response.success(res, result, 'Token cancelled');
  } catch (err) {
    next(err);
  }
};

const listTokens = async (req, res, next) => {
  try {
    const { serviceId, statuses } = req.query;
    if (!serviceId) return response.badRequest(res, 'serviceId query param required');

    const statusList = statuses ? statuses.split(',') : null;
    const tokens = await tokenService.getServiceQueue(req.user.orgId, serviceId, statusList);
    return response.success(res, tokens, 'Queue retrieved', 200, { count: tokens.length });
  } catch (err) {
    next(err);
  }
};

module.exports = { requestToken, getMyToken, getToken, getTokenQR, cancelToken, listTokens };

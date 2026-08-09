'use strict';

const queueService = require('./queue.service');
const response = require('../../utils/apiResponse');

const callNext = async (req, res, next) => {
  try {
    const { serviceId, counterId } = req.body;
    if (!serviceId || !counterId) return response.badRequest(res, 'serviceId and counterId are required');

    const result = await queueService.callNext({
      orgId: req.user.orgId,
      serviceId,
      counterId,
      calledBy: req.user.id,
    });
    return response.success(res, result, 'Next patient called');
  } catch (err) {
    next(err);
  }
};

const markServing = async (req, res, next) => {
  try {
    const token = await queueService.markServing({
      tokenId: req.params.tokenId,
      orgId: req.user.orgId,
      confirmedBy: req.user.id,
    });
    return response.success(res, token, 'Marked as serving');
  } catch (err) {
    next(err);
  }
};

const complete = async (req, res, next) => {
  try {
    const token = await queueService.complete({
      tokenId: req.params.tokenId,
      orgId: req.user.orgId,
      completedBy: req.user.id,
    });
    return response.success(res, token, 'Service completed');
  } catch (err) {
    next(err);
  }
};

const markNoShow = async (req, res, next) => {
  try {
    const token = await queueService.markNoShow({
      tokenId: req.params.tokenId,
      orgId: req.user.orgId,
      markedBy: req.user.id,
    });
    return response.success(res, token, 'Marked as no-show');
  } catch (err) {
    next(err);
  }
};

const rejoin = async (req, res, next) => {
  try {
    const { noShowTokenId } = req.body;
    if (!noShowTokenId) return response.badRequest(res, 'noShowTokenId is required');

    const result = await queueService.rejoin({
      noShowTokenId,
      orgId: req.user.orgId,
      receptionistId: req.user.id,
    });
    return response.success(res, result, 'Patient rejoined the queue');
  } catch (err) {
    next(err);
  }
};

const getStats = async (req, res, next) => {
  try {
    const { serviceId } = req.query;
    if (!serviceId) return response.badRequest(res, 'serviceId is required');

    const stats = await queueService.getQueueStats(req.user.orgId, serviceId);
    return response.success(res, stats);
  } catch (err) {
    next(err);
  }
};

module.exports = { callNext, markServing, complete, markNoShow, rejoin, getStats };

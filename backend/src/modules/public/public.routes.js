'use strict';

const express = require('express');
const router = express.Router();
const { Service } = require('../../models/Service');
const { Organization } = require('../../models/Organization');
const response = require('../../utils/apiResponse');

// Get active services for a given organization (by slug)
router.get('/services', async (req, res, next) => {
  try {
    const { orgSlug } = req.query;
    if (!orgSlug) return response.badRequest(res, 'orgSlug query param is required');

    const org = await Organization.findOne({ slug: orgSlug, isActive: true });
    if (!org) return response.notFound(res, 'Organization not found');

    const services = await Service.find({ orgId: org._id, isActive: true }).select('name description avgServiceTimeMinutes');
    return response.success(res, services);
  } catch (err) {
    next(err);
  }
});

// Get organization details
router.get('/org', async (req, res, next) => {
  try {
    const { orgSlug } = req.query;
    if (!orgSlug) return response.badRequest(res, 'orgSlug query param is required');

    const org = await Organization.findOne({ slug: orgSlug, isActive: true })
      .select('name slug address phone email bookingOpenTime bookingCloseTime serviceStartTime serviceEndTime');
    if (!org) return response.notFound(res, 'Organization not found');

    return response.success(res, org);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

'use strict';

const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // Override org-level capacity defaults for this specific service
    dailyCapacity: {
      type: Number,
      default: null, // null = use org default
    },
    onlineCapacity: {
      type: Number,
      default: null,
    },
    walkInCapacity: {
      type: Number,
      default: null,
    },
    // Average service time per patient in minutes (used for ETA calculation)
    avgServiceTimeMinutes: {
      type: Number,
      default: 10,
    },
    // Token number prefix (e.g. 'OPD' → OPD001, OPD002...)
    tokenPrefix: {
      type: String,
      default: 'T',
      maxlength: 5,
      uppercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Mid-day capacity change policy: existing RESERVED tokens grandfathered (§7)
    // This flag just documents intent — grandfathering is enforced in the token service
    grandfatherExistingOnCapacityChange: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

serviceSchema.index({ orgId: 1, isActive: 1 });
serviceSchema.index({ orgId: 1, name: 1 }, { unique: true });

const Service = mongoose.model('Service', serviceSchema);

module.exports = { Service };

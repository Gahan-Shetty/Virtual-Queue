'use strict';

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true, // e.g. "Counter 1", "Dr. Smith's Room"
    },
    // Staff member currently assigned to this counter
    assignedStaffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Current status of this counter
    status: {
      type: String,
      enum: ['IDLE', 'SERVING', 'BREAK', 'CLOSED'],
      default: 'IDLE',
    },
    // Currently serving token (for display boards)
    currentTokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Token',
      default: null,
    },
    currentTokenNumber: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

counterSchema.index({ orgId: 1, serviceId: 1, isActive: 1 });

const Counter = mongoose.model('Counter', counterSchema);

module.exports = { Counter };

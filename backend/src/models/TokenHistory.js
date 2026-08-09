'use strict';

const mongoose = require('mongoose');

/**
 * TokenHistory — immutable audit trail (§19).
 * One record per state transition. Never updated, only inserted.
 */
const tokenHistorySchema = new mongoose.Schema(
  {
    tokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Token',
      required: true,
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // State transition
    fromStatus: {
      type: String,
      required: true,
    },
    toStatus: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    // Who triggered this transition
    triggeredBy: {
      type: String,
      enum: ['PATIENT', 'STAFF', 'SYSTEM'],
      required: true,
    },
    triggeredById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null for SYSTEM-triggered (e.g. expiry worker)
    },
    // Reason for non-happy-path transitions
    reason: {
      type: String,
      trim: true,
      default: null, // e.g. 'Reservation expired', 'Patient did not respond', 'Admin cancelled'
    },
    // Metadata snapshot (for dispute resolution)
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: false, // we manage `timestamp` explicitly
    versionKey: false,
  }
);

// Audit queries: all history for a token, in order
tokenHistorySchema.index({ tokenId: 1, timestamp: 1 });

// Reporting: all transitions for an org on a date
tokenHistorySchema.index({ orgId: 1, timestamp: -1 });

// Dispute resolution: transitions for a specific patient
tokenHistorySchema.index({ patientId: 1, timestamp: -1 });

const TokenHistory = mongoose.model('TokenHistory', tokenHistorySchema);

module.exports = { TokenHistory };

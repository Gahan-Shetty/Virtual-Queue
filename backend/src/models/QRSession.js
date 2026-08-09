'use strict';

const mongoose = require('mongoose');

/**
 * QRSession — tracks active location-based QR check-in sessions.
 * These are the rotating display QR codes (spec §9 option 1 — UX layer only).
 * The actual security boundary is the per-patient token QR (option 2).
 */
const qrSessionSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    locationId: {
      type: String,
      required: true, // e.g. 'entrance-A', 'gate-1'
      trim: true,
    },
    sessionKey: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
    // Who generated this QR session
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// TTL index: MongoDB automatically removes expired sessions
qrSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
qrSessionSchema.index({ orgId: 1, locationId: 1, isRevoked: 1 });

const QRSession = mongoose.model('QRSession', qrSessionSchema);

module.exports = { QRSession };

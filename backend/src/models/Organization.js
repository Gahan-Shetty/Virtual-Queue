'use strict';

const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    phone: String,
    email: String,

    // ── Booking window (§7) ───────────────────────────────────────────────
    bookingOpenTime: {
      type: String,
      default: '08:00', // HH:mm local time
    },
    bookingCloseTime: {
      type: String,
      default: '11:00',
    },
    serviceStartTime: {
      type: String,
      default: '09:00',
    },
    serviceEndTime: {
      type: String,
      default: '13:00',
    },

    // ── Capacity defaults (§11) — overridable per Service ────────────────
    dailyCapacity: {
      type: Number,
      default: 100,
    },
    onlineCapacity: {
      type: Number,
      default: 60,
    },
    walkInCapacity: {
      type: Number,
      default: 40,
    },

    // ── Reservation expiry (§8) ───────────────────────────────────────────
    reservationExpiryMinutes: {
      type: Number,
      default: 30, // How long after booking open the patient must check in
    },
    checkInGracePeriodMinutes: {
      type: Number,
      default: 10,
    },

    // ── No-show policy (§10) ──────────────────────────────────────────────
    noShowGracePeriodMinutes: {
      type: Number,
      default: 5,
    },
    maxNoShowRejoinsPerDay: {
      type: Number,
      default: 1, // per-day rejoin cap to prevent gaming
    },

    // ── Multi-counter routing (§17) ───────────────────────────────────────
    // 'CALL_TIME' = counterId assigned when staff calls next (recommended)
    // 'CHECKIN_TIME' = counterId assigned at check-in
    counterAssignmentPolicy: {
      type: String,
      enum: ['CALL_TIME', 'CHECKIN_TIME'],
      default: 'CALL_TIME',
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

organizationSchema.index({ slug: 1 });

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = { Organization };

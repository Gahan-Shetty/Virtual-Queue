'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['PATIENT', 'RECEPTIONIST', 'DOCTOR', 'ADMIN'];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by default
    },
    role: {
      type: String,
      enum: ROLES,
      required: true,
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    // For DOCTOR / RECEPTIONIST: which service/counter they are assigned to
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    counterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Counter',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false, // patient email/phone must be verified
    },
    // Refresh token — stored hashed so we can rotate/invalidate
    refreshTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    // Per-day no-show rejoin counter (reset daily)
    noShowRejoinCount: {
      type: Number,
      default: 0,
    },
    noShowRejoinDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Instance Methods ──────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokenHash;
  return obj;
};

// ── Static Methods ────────────────────────────────────────────────────────

userSchema.statics.hashPassword = async (plain) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plain, salt);
};

// ── Pre-save ──────────────────────────────────────────────────────────────

userSchema.pre('save', async function (next) {
  // passwordHash is set explicitly; no auto-hash hook to avoid double-hashing
  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────

userSchema.index({ email: 1 }); // unique already but explicit for clarity
userSchema.index({ orgId: 1, role: 1 });
userSchema.index({ phone: 1, orgId: 1 });

const User = mongoose.model('User', userSchema);

module.exports = { User, ROLES };

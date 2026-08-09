'use strict';

/**
 * Notification service — Socket.IO primary + Email/SMS stubs (spec §18).
 *
 * Architecture note from spec §18:
 *   - Socket.IO is the primary real-time channel (always-open tab/app).
 *   - SMS/email is the fallback for patients who close the browser or wander off.
 *   - On Socket.IO reconnect, clients re-fetch state via REST; sockets never carry
 *     state across a disconnect gap.
 */

const { emitToPatient } = require('../config/socket');
const logger = require('./logger');
// const nodemailer = require('nodemailer'); // Uncomment when SMTP is configured
// const twilio = require('twilio');         // Uncomment when Twilio is configured

// ── Email stub ─────────────────────────────────────────────────────────────

const sendEmail = async ({ to, subject, text, html }) => {
  // TODO: replace with real nodemailer transport
  // const transporter = nodemailer.createTransport({...});
  // await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text, html });
  logger.info(`[EMAIL STUB] To: ${to} | Subject: ${subject}`);
};

// ── SMS stub ───────────────────────────────────────────────────────────────

const sendSMS = async ({ to, body }) => {
  // TODO: replace with real Twilio client
  // const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  // await client.messages.create({ body, from: env.TWILIO_PHONE_NUMBER, to });
  logger.info(`[SMS STUB] To: ${to} | Message: ${body}`);
};

// ── High-level notification helpers ───────────────────────────────────────

/**
 * Notify a patient when their token is called.
 * Tries socket first; sends SMS fallback for offline patients.
 */
const notifyPatientCalled = async (patient, token, counter) => {
  // Socket notification (real-time for active tab)
  emitToPatient(patient._id.toString(), 'token:called', {
    tokenId: token._id,
    tokenNumber: token.tokenNumber,
    counterName: counter?.name,
    message: `Token ${token.tokenNumber} — please proceed to ${counter?.name || 'the counter'} now.`,
  });

  // SMS fallback (for patients who stepped away)
  if (patient.phone) {
    await sendSMS({
      to: patient.phone,
      body: `[Queue Alert] Token ${token.tokenNumber} called. Please proceed to ${counter?.name || 'the counter'} immediately.`,
    });
  }
};

/**
 * Notify a patient their reservation is about to expire (pre-warning).
 */
const notifyReservationExpiring = async (patient, token, minutesLeft) => {
  emitToPatient(patient._id.toString(), 'token:expiry_warning', {
    tokenId: token._id,
    tokenNumber: token.tokenNumber,
    minutesLeft,
    message: `Your check-in deadline is in ${minutesLeft} minutes. Please arrive and check in now.`,
  });

  if (patient.phone) {
    await sendSMS({
      to: patient.phone,
      body: `[Queue Reminder] ${minutesLeft} min left to check in. Token: ${token.tokenNumber}. Please arrive now or your spot will be released.`,
    });
  }
};

/**
 * Notify a patient their reservation expired.
 */
const notifyReservationExpired = async (patient, token) => {
  emitToPatient(patient._id.toString(), 'token:expired', {
    tokenId: token._id,
    tokenNumber: token.tokenNumber,
    message: 'Your reservation expired. Ask reception for a new token.',
  });

  if (patient.email) {
    await sendEmail({
      to: patient.email,
      subject: 'Your queue reservation expired',
      text: `Your reservation (${token.tokenNumber}) expired. Please ask reception for a new token when you arrive.`,
    });
  }
};

module.exports = {
  sendEmail,
  sendSMS,
  notifyPatientCalled,
  notifyReservationExpiring,
  notifyReservationExpired,
};

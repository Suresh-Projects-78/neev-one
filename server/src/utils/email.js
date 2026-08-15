const config = require('../config');
const nodemailer = require('nodemailer');

// Simple email helper: configure SMTP via env. In dev this will log the reset link.
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

async function sendPasswordReset(email, token) {
  const resetLink = `https://example.com/reset-password?token=${token}`;
  const body = `Click to reset your password: ${resetLink}`;
  try {
    if (!config.smtp.host) {
      console.log('[email] no smtp configured, password reset link:', resetLink);
      return;
    }
    await transporter.sendMail({ from: config.emailFrom, to: email, subject: 'Password reset', text: body });
  } catch (e) {
    console.error('Email error', e);
  }
}

module.exports = { sendPasswordReset };

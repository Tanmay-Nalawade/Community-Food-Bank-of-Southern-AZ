const nodemailer = require("nodemailer");

let transporter = null;

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  return transporter;
}

async function sendEmail({ to, subject, html }) {
  if (!isConfigured()) {
    console.log(`[email:mock] To: ${to} | Subject: ${subject}`);
    return { mock: true };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  return getTransporter().sendMail({ from, to, subject, html });
}

module.exports = { isConfigured, sendEmail };

const nodemailer = require("nodemailer");

let transporter = null;

// SMTP_HOST alone turns real email on. SMTP_USER/SMTP_PASSWORD are optional so
// unauthenticated relays work too — e.g. Microsoft 365 Direct Send
// (<tenant>.mail.protection.outlook.com, port 25), which takes no login.
function isConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

function hasCredentials() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter() {
  if (!transporter) {
    const transportOptions = {
      host: process.env.SMTP_HOST,
      // Unauthenticated relays (Direct Send) listen on 25; authenticated
      // submission is 587. SMTP_PORT always wins when set.
      port: Number(process.env.SMTP_PORT) || (hasCredentials() ? 587 : 25),
      secure: process.env.SMTP_SECURE === "true",
    };

    if (hasCredentials()) {
      transportOptions.auth = {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      };
    }

    transporter = nodemailer.createTransport(transportOptions);
  }

  return transporter;
}

async function sendEmail({ to, subject, html }) {
  if (!isConfigured()) {
    console.log(`[email:mock] To: ${to} | Subject: ${subject}`);
    return { mock: true };
  }

  // Without a login there's no account to send "as", so SMTP_FROM is required
  // — Direct Send only accepts a sender from the organization's own domain.
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from) {
    throw new Error("SMTP_FROM must be set to the address emails are sent from.");
  }

  return getTransporter().sendMail({ from, to, subject, html });
}

module.exports = { isConfigured, sendEmail };

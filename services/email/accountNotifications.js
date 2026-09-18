const path = require("path");
const ejs = require("ejs");
const { sendEmail, isConfigured } = require("./index");

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:8080";

function renderEmail(templateName, data) {
  const templatePath = path.join(__dirname, "..", "..", "views", "emails", `${templateName}.ejs`);
  return ejs.renderFile(templatePath, data);
}

// sendEmail()'s own mock branch only logs "To/Subject", not the body — so
// without this, the link would be unreachable in dev (no SMTP configured).
// Only logged when unconfigured, so a real deployment never leaks a live
// reset/verification link into server logs.
function logMockLink(label, user, link) {
  if (!isConfigured()) {
    console.log(`[email:mock] ${label} for ${user.email}: ${link}`);
  }
}

async function sendVerificationEmail(user, token) {
  const link = `${APP_BASE_URL}/verify-email/${token}`;
  logMockLink("Verification link", user, link);

  const html = await renderEmail("verify-email", { firstName: user.firstName, link });

  await sendEmail({
    to: user.email,
    subject: "Verify your email — Community Food Bank Motor Pool",
    html,
  });
}

async function sendPasswordResetEmail(user, token) {
  const link = `${APP_BASE_URL}/reset-password/${token}`;
  logMockLink("Password reset link", user, link);

  const html = await renderEmail("reset-password", { firstName: user.firstName, link });

  await sendEmail({
    to: user.email,
    subject: "Reset your password — Community Food Bank Motor Pool",
    html,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };

const path = require("path");
const ejs = require("ejs");
const { sendEmail } = require("./index");
const fmt = require("../../utils/formatDate");

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:8080";

// Emails the fleet-wide report (every vehicle's detailed mileage log,
// grouped by vehicle — built by services/mileageLog.buildFleetLog) to
// whoever the admin entered. Errors are thrown rather than swallowed — this
// runs because someone clicked Send, so they need to be told if it failed.
async function sendTripLog({ report, rangeLabel, recipient, sentBy }) {
  const html = await ejs.renderFile(path.join(__dirname, "..", "..", "views", "emails", "trip-log.ejs"), {
    fmt,
    report,
    rangeLabel,
    sentByName: sentBy ? `${sentBy.firstName} ${sentBy.lastName}`.trim() : "",
    reportsUrl: `${APP_BASE_URL}/admin/reports`,
  });

  await sendEmail({
    to: recipient,
    subject: `Monthly Report — ${rangeLabel} — Community Food Bank Motor Pool`,
    html,
  });
}

module.exports = { sendTripLog };

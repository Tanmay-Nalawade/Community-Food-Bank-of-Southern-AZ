const path = require("path");
const ejs = require("ejs");
const { sendEmail } = require("./index");
const { Vehicle } = require("../../models");
const { getRecipients } = require("../notificationSettings");

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:8080";

// Emails everyone on the "Vehicle issue reported" list about newly filed
// issue(s) on one vehicle. Best-effort: a mail failure is logged, never
// thrown — the issue itself is already saved, and the driver reporting it
// shouldn't see an error because of an SMTP hiccup.
async function notifyVehicleIssues({ vehicleId, descriptions, reporter, reservationId, source }) {
  try {
    const recipients = await getRecipients("vehicleIssue");
    if (!recipients.length || !descriptions.length) {
      return;
    }

    const vehicle = await Vehicle.findByPk(vehicleId, { attributes: ["id", "make", "model", "year", "licensePlate"] });
    if (!vehicle) {
      return;
    }
    const vehicleName = `${vehicle.year ? vehicle.year + " " : ""}${vehicle.make} ${vehicle.model}`;

    const html = await ejs.renderFile(path.join(__dirname, "..", "..", "views", "emails", "vehicle-issue.ejs"), {
      vehicleName,
      licensePlate: vehicle.licensePlate,
      descriptions,
      reporterName: reporter ? `${reporter.firstName} ${reporter.lastName}`.trim() : "",
      source: source || "",
      issuesUrl: `${APP_BASE_URL}/admin/issues`,
      reservationUrl: reservationId ? `${APP_BASE_URL}/admin/reservations/${reservationId}` : null,
    });

    await sendEmail({
      to: recipients.join(", "),
      subject: `Vehicle issue reported — ${vehicleName} (${vehicle.licensePlate})`,
      html,
    });
  } catch (error) {
    console.error("Failed to send vehicle issue notification:", error);
  }
}

module.exports = { notifyVehicleIssues };

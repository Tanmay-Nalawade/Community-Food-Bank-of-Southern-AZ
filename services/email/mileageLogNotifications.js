const path = require("path");
const ejs = require("ejs");
const { sendEmail } = require("./index");

const RECIPIENT = process.env.MILEAGE_LOG_RECIPIENT || "Transportation@communityfoodbank.org";
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:8080";

function vehicleLabel(vehicle) {
  return `${vehicle.year ? vehicle.year + " " : ""}${vehicle.make} ${vehicle.model}`;
}

async function sendMonthlyMileageLog(log) {
  if (!log) {
    return;
  }

  try {
    const html = await ejs.renderFile(
      path.join(__dirname, "..", "..", "views", "emails", "mileage-log.ejs"),
      {
        vehicleName: vehicleLabel(log.vehicle),
        licensePlate: log.vehicle.licensePlate,
        monthLabel: log.monthLabel,
        rows: log.rows,
        isEmpty: log.isEmpty,
        logUrl: `${APP_BASE_URL}/admin/vehicles/${log.vehicle._id}/mileage-log?year=${log.year}&month=${log.month}`,
      },
    );

    await sendEmail({
      to: RECIPIENT,
      subject: `Monthly Mileage Log — ${vehicleLabel(log.vehicle)} (${log.vehicle.licensePlate}) — ${log.monthLabel}`,
      html,
    });
  } catch (error) {
    console.error("Failed to send monthly mileage log email:", error);
  }
}

module.exports = { sendMonthlyMileageLog, RECIPIENT };

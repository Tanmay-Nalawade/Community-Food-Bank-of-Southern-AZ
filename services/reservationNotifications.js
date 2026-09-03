const path = require("path");
const ejs = require("ejs");
const Reservation = require("../models/reservation");
const { sendEmail } = require("./email");
const { formatBookingLabel } = require("../utils/availability");

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:8080";

function vehicleLabel(vehicle) {
  return `${vehicle.year ? vehicle.year + " " : ""}${vehicle.make} ${vehicle.model}`;
}

function bookingLabelFor(reservation) {
  return formatBookingLabel({
    start: reservation.requestedStartTime,
    end: reservation.requestedEndTime,
  });
}

function renderEmail(templateName, data) {
  const templatePath = path.join(__dirname, "..", "views", "emails", `${templateName}.ejs`);
  return ejs.renderFile(templatePath, data);
}

async function sendBookingConfirmation(reservation, user, vehicle) {
  if (!user?.email) {
    return;
  }

  try {
    const html = await renderEmail("confirmation", {
      firstName: user.firstName,
      vehicleName: vehicleLabel(vehicle),
      bookingLabel: bookingLabelFor(reservation),
      status: reservation.status,
      dashboardUrl: `${APP_BASE_URL}/reservations/mine`,
    });

    await sendEmail({
      to: user.email,
      subject: "Your vehicle booking — Community Food Bank Motor Pool",
      html,
    });

    await Reservation.findByIdAndUpdate(reservation._id, {
      $set: { "notifications.confirmationSentAt": new Date() },
    });
  } catch (error) {
    console.error("Failed to send booking confirmation email:", error);
  }
}

async function sendReminder(reservation, type) {
  const user = reservation.userId;
  const vehicle = reservation.vehicleId;

  if (!user?.email || !vehicle) {
    return;
  }

  try {
    const html = await renderEmail("reminder", {
      firstName: user.firstName,
      vehicleName: vehicleLabel(vehicle),
      bookingLabel: bookingLabelFor(reservation),
      bookingCode: reservation.keyCafeAccess?.bookingCode || null,
      isFinal: type === "final",
      dashboardUrl: `${APP_BASE_URL}/reservations/mine`,
    });

    const subject =
      type === "final"
        ? "Reminder: your vehicle pickup is tomorrow"
        : "Reminder: upcoming vehicle booking in a few days";

    await sendEmail({ to: user.email, subject, html });

    const field = type === "final" ? "reminderFinalSentAt" : "reminder3DaySentAt";
    await Reservation.findByIdAndUpdate(reservation._id, {
      $set: { [`notifications.${field}`]: new Date() },
    });
  } catch (error) {
    console.error(`Failed to send ${type} reminder email:`, error);
  }
}

module.exports = { sendBookingConfirmation, sendReminder };

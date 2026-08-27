const Reservation = require("../models/reservation");

const FLEET_UNAVAILABLE = ["Maintenance", "Out of Service"];

function parseBookingWindow(date, startTime, endTime) {
  if (!date || !startTime || !endTime) {
    return null;
  }

  const start = new Date(`${date}T${startTime}`);
  const end = new Date(`${date}T${endTime}`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  if (end <= start) {
    return null;
  }

  return { date, startTime, endTime, start, end };
}

async function getBookedVehicleIds(start, end) {
  return Reservation.find({
    status: { $in: ["Reserved", "Active"] },
    requestedStartTime: { $lt: end },
    requestedEndTime: { $gt: start },
  }).distinct("vehicleId");
}

function formatBookingLabel(booking) {
  const dateLabel = booking.start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const formatTime = (date) =>
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

  return `${dateLabel}, ${formatTime(booking.start)} – ${formatTime(booking.end)}`;
}

function toQueryString(booking) {
  return new URLSearchParams({
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
  }).toString();
}

module.exports = {
  FLEET_UNAVAILABLE,
  parseBookingWindow,
  getBookedVehicleIds,
  formatBookingLabel,
  toQueryString,
};

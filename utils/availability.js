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
    status: { $in: ["Pending", "Reserved", "Active"] },
    requestedStartTime: { $lt: end },
    requestedEndTime: { $gt: start },
  }).distinct("vehicleId");
}

const TIGHT_GAP_MS = 60 * 60 * 1000;

// Finds the closest prior booking for this vehicle, then warns only when it
// ends less than an hour before the new start AND on the same calendar day
// — a same-vehicle same-day turnaround is the tight-handoff case worth
// flagging; a booking ending late one night and another starting early the
// next morning is a full day apart in practice, not a tight turnaround.
async function findTightPrecedingBooking(vehicleId, booking, { excludeReservationId } = {}) {
  const filter = {
    vehicleId,
    status: { $in: ["Pending", "Reserved", "Active"] },
    requestedEndTime: { $lte: booking.start },
  };
  if (excludeReservationId) {
    filter._id = { $ne: excludeReservationId };
  }

  const previous = await Reservation.findOne(filter).sort({ requestedEndTime: -1 });
  if (!previous) {
    return null;
  }

  const sameDay = previous.requestedEndTime.toDateString() === booking.start.toDateString();
  const gapMs = booking.start.getTime() - previous.requestedEndTime.getTime();

  return sameDay && gapMs < TIGHT_GAP_MS ? previous : null;
}

function formatTimeLabel(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
  findTightPrecedingBooking,
  formatTimeLabel,
};

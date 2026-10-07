const { Op } = require("sequelize");
const { sequelize, Reservation, Vehicle } = require("../models");

const FLEET_UNAVAILABLE = ["Maintenance", "Out of Service"];
const { OPEN_STATUSES } = Reservation;

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

// WHERE clause for "an open reservation on this vehicle that overlaps
// the given window".
function overlapWhere(vehicleId, booking, { excludeReservationId } = {}) {
  const where = {
    vehicleId,
    status: { [Op.in]: OPEN_STATUSES },
    requestedStartTime: { [Op.lt]: booking.end },
    requestedEndTime: { [Op.gt]: booking.start },
  };
  if (excludeReservationId) {
    where.id = { [Op.ne]: excludeReservationId };
  }
  return where;
}

async function hasOverlappingReservation(vehicleId, booking, { excludeReservationId, transaction } = {}) {
  const found = await Reservation.findOne({
    attributes: ["id"],
    where: overlapWhere(vehicleId, booking, { excludeReservationId }),
    transaction,
  });
  return Boolean(found);
}

// Runs `work` inside a transaction holding a row lock on the vehicle
// (SELECT ... FOR UPDATE). Every code path that puts a reservation onto a
// vehicle's calendar checks for overlaps inside this lock, so two
// concurrent requests for the same vehicle are serialized — the second one
// waits, then sees the first one's committed row. `work` receives
// { vehicle, transaction } and must pass `transaction` to its queries.
function withVehicleLock(vehicleId, work) {
  return sequelize.transaction(async (transaction) => {
    const vehicle = await Vehicle.findByPk(vehicleId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    return work({ vehicle, transaction });
  });
}

async function getBookedVehicleIds(start, end) {
  const rows = await Reservation.findAll({
    attributes: ["vehicleId"],
    where: {
      status: { [Op.in]: OPEN_STATUSES },
      requestedStartTime: { [Op.lt]: end },
      requestedEndTime: { [Op.gt]: start },
    },
    group: ["vehicleId"],
    raw: true,
  });
  return rows.map((row) => row.vehicleId);
}

const TIGHT_GAP_MS = 60 * 60 * 1000;

// Finds the closest prior booking for this vehicle, then warns only when it
// ends less than an hour before the new start AND on the same calendar day
// — a same-vehicle same-day turnaround is the tight-handoff case worth
// flagging; a booking ending late one night and another starting early the
// next morning is a full day apart in practice, not a tight turnaround.
async function findTightPrecedingBooking(vehicleId, booking, { excludeReservationId } = {}) {
  const where = {
    vehicleId,
    status: { [Op.in]: OPEN_STATUSES },
    requestedEndTime: { [Op.lte]: booking.start },
  };
  if (excludeReservationId) {
    where.id = { [Op.ne]: excludeReservationId };
  }

  const previous = await Reservation.findOne({ where, order: [["requestedEndTime", "DESC"]] });
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
  hasOverlappingReservation,
  withVehicleLock,
  getBookedVehicleIds,
  formatBookingLabel,
  toQueryString,
  findTightPrecedingBooking,
  formatTimeLabel,
};

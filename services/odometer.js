const { Op } = require("sequelize");
const { Reservation, Vehicle } = require("../models");

// Odometer rules:
// - Vehicle.currentMileage is the odometer of record. An admin enters it
//   when adding a vehicle (and can correct it on the vehicle page); after
//   that it's advanced by every end reading a driver records.
// - A trip's start reading is never asked for. It's the vehicle's odometer
//   when the trip begins, i.e. the previous trip's end reading.

const TRIP_STATUSES = ["Active", "Completed"];

class OdometerError extends Error {}

// Sets reservation.startMileage (in memory — callers save) from the
// vehicle's odometer, unless it already has one.
async function fillStartMileage(reservation) {
  if (reservation.startMileage != null) {
    return reservation;
  }
  const vehicle = await Vehicle.findByPk(reservation.vehicleId, { attributes: ["id", "currentMileage"] });
  if (vehicle) {
    reservation.startMileage = vehicle.currentMileage;
  }
  return reservation;
}

// Sets reservation.endMileage (in memory — callers save, then call
// afterEndMileageSaved). Throws OdometerError with a driver-facing message
// if the reading is below the trip's start.
async function applyEndMileage(reservation, endMileage) {
  await fillStartMileage(reservation);
  if (reservation.startMileage != null && endMileage < reservation.startMileage) {
    throw new OdometerError(
      `The end odometer can't be less than this trip's start reading ` +
        `(${reservation.startMileage.toLocaleString()} mi).`,
    );
  }
  reservation.endMileage = endMileage;
  return reservation;
}

// Once an end reading is saved: advance the vehicle's odometer (never
// backwards — odometers only go up, and an older trip's late correction
// mustn't roll it back), and make the vehicle's next trip start from this
// reading, in case that trip already began before this one's end was in.
async function afterEndMileageSaved(reservation) {
  const reading = reservation.endMileage;
  if (reading == null) {
    return;
  }

  await Vehicle.update(
    { currentMileage: reading },
    { where: { id: reservation.vehicleId, currentMileage: { [Op.lt]: reading } } },
  );

  // Bookings on one vehicle never overlap, so requestedStartTime order is
  // trip order.
  const next = await Reservation.findOne({
    where: {
      vehicleId: reservation.vehicleId,
      id: { [Op.ne]: reservation.id },
      status: { [Op.in]: TRIP_STATUSES },
      requestedStartTime: { [Op.gt]: reservation.requestedStartTime },
    },
    order: [["requestedStartTime", "ASC"]],
  });

  // Left alone if that trip already has an end reading below this one —
  // rewriting its start would make its distance negative; an admin needs
  // to sort that out by hand.
  if (next && next.startMileage !== reading && (next.endMileage == null || next.endMileage >= reading)) {
    next.startMileage = reading;
    await next.save();
  }
}

module.exports = { OdometerError, fillStartMileage, applyEndMileage, afterEndMileageSaved };

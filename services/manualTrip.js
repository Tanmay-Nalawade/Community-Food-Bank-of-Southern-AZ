const { Op } = require("sequelize");
const { Reservation } = require("../models");
const { withVehicleLock, formatBookingLabel } = require("../utils/availability");
const { startReadingBefore, afterEndMileageSaved } = require("./odometer");

// Anything that means the vehicle was (or is going to be) out at that time —
// including a trip a driver has submitted that's still waiting for review.
const OCCUPYING_STATUSES = ["Pending", "Reserved", "Active", "Completed", "Submitted"];

// A problem with the trip the person entering it can fix (overlap, odometer).
// Thrown inside withVehicleLock, so the transaction is rolled back.
class TripEntryError extends Error {}

async function assertNoClash(vehicleId, booking, { excludeId, transaction }) {
  const clash = await Reservation.findOne({
    where: {
      vehicleId,
      status: { [Op.in]: OCCUPYING_STATUSES },
      requestedStartTime: { [Op.lt]: booking.end },
      requestedEndTime: { [Op.gt]: booking.start },
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
    transaction,
  });
  if (clash) {
    const kind = clash.status === "Submitted" ? "submitted trip" : clash.isManualEntry ? "logged trip" : "booking";
    throw new TripEntryError(
      `That vehicle already has a ${kind} overlapping this time ` +
        `(${formatBookingLabel({ start: clash.requestedStartTime, end: clash.requestedEndTime })}).`,
    );
  }
}

async function startReadingFor(vehicleId, start, endMileage, { transaction }) {
  const startMileage = await startReadingBefore(vehicleId, start, { transaction });
  if (startMileage != null && endMileage < startMileage) {
    throw new TripEntryError(
      `The end odometer can't be less than this trip's start reading (${startMileage.toLocaleString()} mi — ` +
        "the vehicle's reading after its previous trip).",
    );
  }
  return startMileage;
}

// Records a trip that happened without a booking (someone took a vehicle
// without reserving it). An admin's entry is saved as Completed straight
// away; a driver's is saved as Submitted, which keeps it out of the trip
// log, mileage reports and odometer chain (they only count Active/Completed)
// until an admin approves it with approveSubmittedTrip.
async function recordManualTrip({ vehicle, driver, booking, values, loggedBy, submitted, notes }) {
  const reservation = await withVehicleLock(vehicle.id, async ({ transaction }) => {
    await assertNoClash(vehicle.id, booking, { transaction });
    const startMileage = await startReadingFor(vehicle.id, booking.start, values.endMileage, { transaction });

    return Reservation.create(
      {
        userId: driver.id,
        vehicleId: vehicle.id,
        requestedStartTime: booking.start,
        requestedEndTime: booking.end,
        tripStartedAt: booking.start,
        tripEndedAt: booking.end,
        status: submitted ? "Submitted" : "Completed",
        isManualEntry: true,
        loggedById: loggedBy.id,
        reviewedById: submitted ? null : loggedBy.id,
        reviewedAt: submitted ? null : new Date(),
        startMileage,
        endMileage: values.endMileage,
        fuelLevelEndPercent: values.fuelLevelEndPercent ?? null,
        droppedOffFood: values.droppedOffFood === "on",
        pickedUpFood: values.pickedUpFood === "on",
        washed: values.washed === "on",
        tripFoodRelated: values.tripFoodRelated,
        tripFoodRelatedDetail: values.tripFoodRelated === "Other" ? values.tripFoodRelatedDetail || "" : "",
        ...(submitted ? { staffNotes: notes || "" } : { adminNotes: notes || "" }),
      },
      { transaction },
    );
  });

  if (!submitted) {
    await afterEndMileageSaved(reservation);
  }
  return reservation;
}

// Turns a driver's Submitted trip into a Completed one. Other trips may have
// been recorded on the vehicle since it was submitted, so the overlap check
// and start reading are redone now rather than trusted from submission time.
async function approveSubmittedTrip(reservation, reviewer) {
  const booking = { start: reservation.requestedStartTime, end: reservation.requestedEndTime };

  await withVehicleLock(reservation.vehicleId, async ({ transaction }) => {
    await assertNoClash(reservation.vehicleId, booking, { excludeId: reservation.id, transaction });
    reservation.startMileage = await startReadingFor(
      reservation.vehicleId,
      booking.start,
      reservation.endMileage,
      { transaction },
    );
    reservation.status = "Completed";
    reservation.reviewedById = reviewer.id;
    reservation.reviewedAt = new Date();
    await reservation.save({ transaction });
  });

  await afterEndMileageSaved(reservation);
  return reservation;
}

module.exports = { TripEntryError, recordManualTrip, approveSubmittedTrip };

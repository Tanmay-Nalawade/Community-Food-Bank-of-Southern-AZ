const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");

const LOGGABLE_STATUSES = ["Active", "Completed"];

// Reservations count toward a given month based on when the trip actually
// started (tripLog.tripStartedAt, set by the KeyCafe pickup webhook),
// falling back to the requested start time for trips that never got a
// webhook (e.g. status set manually by an admin, or KeyCafe not configured).
function effectiveTripDate(reservation) {
  return reservation.tripLog?.tripStartedAt || reservation.requestedStartTime;
}

function driverInitials(user) {
  if (!user) {
    return "";
  }
  return `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase();
}

// Single source of truth for "what does vehicle X's mileage log look like
// for month Y" — used by both the on-demand admin page and the scheduled
// monthly email job, so the query/row-shaping logic exists exactly once.
async function buildMonthlyLog(vehicleId, year, month) {
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) {
    return null;
  }

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 1, 0, 0, 0, 0);

  const reservations = await Reservation.find({
    vehicleId,
    status: { $in: LOGGABLE_STATUSES },
    $or: [
      { "tripLog.tripStartedAt": { $gte: monthStart, $lt: monthEnd } },
      {
        "tripLog.tripStartedAt": { $exists: false },
        requestedStartTime: { $gte: monthStart, $lt: monthEnd },
      },
    ],
  })
    .populate("userId", "firstName lastName")
    .sort({ requestedStartTime: 1 });

  const rows = reservations.map((reservation) => {
    const trip = reservation.tripLog || {};
    const start = trip.startMileage;
    const end = trip.endMileage;

    return {
      reservationId: reservation._id,
      date: effectiveTripDate(reservation),
      driverInitials: driverInitials(reservation.userId),
      startMileage: start ?? null,
      endMileage: end ?? null,
      distanceTravelled: start != null && end != null ? end - start : null,
      preTripInspectionPassed:
        trip.preTripInspectionPassed === undefined ? null : trip.preTripInspectionPassed,
      fuelLevelEndPercent: trip.fuelLevelEndPercent ?? null,
      droppedOffFood: Boolean(trip.droppedOffFood),
      pickedUpFood: Boolean(trip.pickedUpFood),
      other: Boolean(trip.otherDuty),
      otherNote: trip.otherDutyNote || "",
      washed: Boolean(trip.washed),
    };
  });

  return {
    vehicle,
    year,
    month,
    monthLabel: monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    rows,
    isEmpty: rows.length === 0,
  };
}

module.exports = { buildMonthlyLog };

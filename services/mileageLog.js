const { Op } = require("sequelize");
const { Reservation, Vehicle } = require("../models");

const LOGGABLE_STATUSES = ["Active", "Completed"];

// Reservations count toward a given month based on when the trip actually
// started (tripStartedAt, set by the KeyCafe pickup webhook),
// falling back to the requested start time for trips that never got a
// webhook (e.g. status set manually by an admin, or KeyCafe not configured).
function effectiveTripDate(reservation) {
  return reservation.tripStartedAt || reservation.requestedStartTime;
}

function driverFullName(user) {
  if (!user) {
    return "";
  }
  return `${user.firstName || ""} ${user.lastName || ""}`.trim();
}

// WHERE fragment matching trips whose effective date (see
// effectiveTripDate) falls in [start, end). Shared by the per-vehicle
// monthly log and the fleet-wide Trip Log email so both agree on which
// month/range a trip belongs to.
function tripDateInRange(start, end) {
  return {
    [Op.or]: [
      { tripStartedAt: { [Op.gte]: start, [Op.lt]: end } },
      { tripStartedAt: null, requestedStartTime: { [Op.gte]: start, [Op.lt]: end } },
    ],
  };
}

// Single source of truth for "what does vehicle X's mileage log look like
// for month Y", so the query/row-shaping logic exists exactly once.
async function buildMonthlyLog(vehicleId, year, month) {
  const vehicle = await Vehicle.findByPk(vehicleId);
  if (!vehicle) {
    return null;
  }

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month, 1, 0, 0, 0, 0);

  const reservations = await Reservation.findAll({
    where: {
      vehicleId,
      status: { [Op.in]: LOGGABLE_STATUSES },
      ...tripDateInRange(monthStart, monthEnd),
    },
    include: [{ association: "user", attributes: ["id", "firstName", "lastName"] }],
    order: [["requestedStartTime", "ASC"], ["id", "ASC"]],
  });

  const rows = reservations.map((reservation) => {
    const start = reservation.startMileage;
    const end = reservation.endMileage;

    return {
      reservationId: reservation.id,
      date: effectiveTripDate(reservation),
      driverName: driverFullName(reservation.user),
      startMileage: start ?? null,
      endMileage: end ?? null,
      distanceTravelled: start != null && end != null ? end - start : null,
      // Simplified to a plain boolean for reporting — "Other" doesn't
      // confirm the trip was actually for food, so only "Yes" counts.
      foodRelated: reservation.tripFoodRelated === "Yes",
      manualEntry: reservation.isManualEntry,
      preTripInspectionPassed: reservation.preTripInspectionPassed ?? null,
      fuelLevelEndPercent: reservation.fuelLevelEndPercent ?? null,
      droppedOffFood: Boolean(reservation.droppedOffFood),
      pickedUpFood: Boolean(reservation.pickedUpFood),
      other: Boolean(reservation.otherDuty),
      otherNote: reservation.otherDutyNote || "",
      washed: Boolean(reservation.washed),
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

module.exports = { buildMonthlyLog, effectiveTripDate, driverFullName, tripDateInRange, LOGGABLE_STATUSES };

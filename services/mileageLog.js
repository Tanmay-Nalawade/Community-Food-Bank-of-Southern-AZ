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

  const rows = reservations.map(shapeLogRow);

  return {
    vehicle,
    year,
    month,
    monthLabel: monthLabel(year, month),
    rows,
    isEmpty: rows.length === 0,
  };
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// One detailed mileage-log row for a trip — the same columns everywhere the
// log appears (per-vehicle page, fleet monthly report, emailed report).
function shapeLogRow(reservation) {
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
}

function sumDistance(rows) {
  return rows.reduce((sum, row) => sum + (row.distanceTravelled || 0), 0);
}

// Every vehicle's detailed mileage log for trips whose effective date falls
// in [start, end), grouped by vehicle — the fleet-wide report shown on
// /admin/reports/monthly and emailed from the Reports page. Only vehicles
// with at least one trip in the range get a section.
async function buildFleetLog(start, end) {
  const reservations = await Reservation.findAll({
    where: {
      status: { [Op.in]: LOGGABLE_STATUSES },
      ...tripDateInRange(start, end),
    },
    include: [
      { association: "user", attributes: ["id", "firstName", "lastName"] },
      {
        association: "vehicle",
        attributes: ["id", "make", "model", "year", "licensePlate", "nextMaintenanceDueMileage", "nextMaintenanceDueDate"],
      },
    ],
    order: [["requestedStartTime", "ASC"], ["id", "ASC"]],
  });

  const sectionsByVehicleId = new Map();
  for (const reservation of reservations) {
    if (!reservation.vehicle) {
      continue;
    }
    if (!sectionsByVehicleId.has(reservation.vehicle.id)) {
      sectionsByVehicleId.set(reservation.vehicle.id, { vehicle: reservation.vehicle, rows: [] });
    }
    sectionsByVehicleId.get(reservation.vehicle.id).rows.push(shapeLogRow(reservation));
  }

  const sections = [...sectionsByVehicleId.values()]
    .map((section) => ({ ...section, totalDistance: sumDistance(section.rows) }))
    .sort((a, b) =>
      `${a.vehicle.make} ${a.vehicle.model}`.localeCompare(`${b.vehicle.make} ${b.vehicle.model}`),
    );

  return {
    sections,
    tripCount: sections.reduce((sum, section) => sum + section.rows.length, 0),
    totalDistance: sections.reduce((sum, section) => sum + section.totalDistance, 0),
  };
}

module.exports = {
  buildMonthlyLog,
  buildFleetLog,
  monthLabel,
  effectiveTripDate,
  driverFullName,
  tripDateInRange,
  LOGGABLE_STATUSES,
};

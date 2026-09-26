const { Op, fn, col, literal } = require("sequelize");
const { Vehicle, Reservation, AccessLog } = require("../../models");
const { fetchPage, PAGE_SIZE } = require("../../utils/pagination");
const { effectiveTripDate, driverFullName } = require("../../services/mileageLog");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Same "did this trip happen" statuses the per-vehicle mileage log uses
// (services/mileageLog.js) — this fleet-wide table is the same underlying
// trip data, just spanning every vehicle instead of one at a time. The
// per-vehicle mileage log is the "detailed" drill-down (adds Pre-Trip
// Inspection, Fuel %, Washed, etc.) linked from each row here.
const TRIP_LOG_STATUSES = ["Active", "Completed"];

function fetchAccessLogs(skip, limit) {
  return AccessLog.findAll({
    include: [
      { association: "user", attributes: ["id", "firstName", "lastName", "email"] },
      { association: "vehicle", attributes: ["id", "make", "model", "licensePlate"] },
    ],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    offset: skip,
    limit,
  });
}

function fetchTripLog(skip, limit) {
  return Reservation.findAll({
    where: { status: { [Op.in]: TRIP_LOG_STATUSES } },
    include: [
      { association: "user", attributes: ["id", "firstName", "lastName"] },
      { association: "vehicle", attributes: ["id", "make", "model", "year", "licensePlate"] },
    ],
    order: [["requestedStartTime", "DESC"], ["id", "DESC"]],
    offset: skip,
    limit,
  });
}

function shapeTripRow(reservation) {
  const start = reservation.startMileage;
  const end = reservation.endMileage;
  const date = effectiveTripDate(reservation);

  return {
    reservationId: reservation.id,
    date,
    vehicle: reservation.vehicle,
    driverName: driverFullName(reservation.user),
    startMileage: start ?? null,
    endMileage: end ?? null,
    distanceTravelled: start != null && end != null ? end - start : null,
    foodRelated: reservation.tripFoodRelated === "Yes",
    mileageLogUrl: reservation.vehicle
      ? `/admin/vehicles/${reservation.vehicle.id}/mileage-log?year=${date.getFullYear()}&month=${date.getMonth() + 1}`
      : null,
  };
}

// Per-vehicle booking count, total booked hours and most recent booking,
// computed in MySQL (was a Mongo $group aggregation).
async function fetchUtilization() {
  const rows = await Reservation.findAll({
    attributes: [
      "vehicleId",
      [fn("COUNT", col("id")), "bookingCount"],
      [
        literal("SUM(TIMESTAMPDIFF(SECOND, requested_start_time, requested_end_time)) / 3600"),
        "totalHours",
      ],
      [fn("MAX", col("requested_start_time")), "lastBookedAt"],
    ],
    where: { status: { [Op.in]: ["Reserved", "Active", "Completed"] } },
    group: ["vehicleId"],
    raw: true,
  });

  return new Map(
    rows.map((row) => [
      row.vehicleId,
      {
        bookingCount: Number(row.bookingCount),
        totalHours: Number(row.totalHours),
        lastBookedAt: row.lastBookedAt ? new Date(row.lastBookedAt) : null,
      },
    ]),
  );
}

exports.index = async (req, res) => {
  const [vehicles, utilizationByVehicleId] = await Promise.all([
    Vehicle.findAll({ order: [["make", "ASC"], ["model", "ASC"]] }),
    fetchUtilization(),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

  const vehicleReport = vehicles
    .map((vehicle) => {
      const stats = utilizationByVehicleId.get(vehicle.id);
      return {
        vehicle,
        bookingCount: stats?.bookingCount || 0,
        totalHours: stats ? Math.round(stats.totalHours) : 0,
        lastBookedAt: stats?.lastBookedAt || null,
        idle: !stats || stats.lastBookedAt < thirtyDaysAgo,
      };
    })
    .sort((a, b) => b.bookingCount - a.bookingCount);

  const { items: accessLogs, hasMore, nextSkip } = await fetchPage(fetchAccessLogs, 0);

  const {
    items: tripReservations,
    hasMore: tripHasMore,
    nextSkip: tripNextSkip,
  } = await fetchPage(fetchTripLog, 0);
  const tripLog = tripReservations.map(shapeTripRow);

  res.render("admin/reports/index", {
    title: "Reports",
    vehicleReport,
    tripLog,
    tripHasMore,
    tripNextSkip,
    accessLogs,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "admin-reports",
  });
};

exports.moreTrips = async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const { items: tripReservations, hasMore } = await fetchPage(fetchTripLog, skip);
  const tripLog = tripReservations.map(shapeTripRow);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/reports/_trip-log-rows", { tripLog });
};

exports.more = async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const { items: accessLogs, hasMore } = await fetchPage(fetchAccessLogs, skip);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/reports/_access-log-rows", { accessLogs });
};

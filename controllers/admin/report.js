const Vehicle = require("../../models/vehicle");
const Reservation = require("../../models/reservation");
const AccessLog = require("../../models/accessLog");
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
  return AccessLog.find({})
    .populate("userId", "firstName lastName email")
    .populate("vehicleId", "make model licensePlate")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
}

function fetchTripLog(skip, limit) {
  return Reservation.find({ status: { $in: TRIP_LOG_STATUSES } })
    .populate("userId", "firstName lastName")
    .populate("vehicleId", "make model year licensePlate")
    .sort({ requestedStartTime: -1 })
    .skip(skip)
    .limit(limit);
}

function shapeTripRow(reservation) {
  const trip = reservation.tripLog || {};
  const start = trip.startMileage;
  const end = trip.endMileage;
  const date = effectiveTripDate(reservation);

  return {
    reservationId: reservation._id,
    date,
    vehicle: reservation.vehicleId,
    driverName: driverFullName(reservation.userId),
    startMileage: start ?? null,
    endMileage: end ?? null,
    distanceTravelled: start != null && end != null ? end - start : null,
    foodRelated: reservation.tripFoodRelated === "Yes",
    mileageLogUrl: reservation.vehicleId
      ? `/admin/vehicles/${reservation.vehicleId._id}/mileage-log?year=${date.getFullYear()}&month=${date.getMonth() + 1}`
      : null,
  };
}

exports.index = async (req, res) => {
  const vehicles = await Vehicle.find({}).sort({ make: 1, model: 1 });

  const utilization = await Reservation.aggregate([
    { $match: { status: { $in: ["Reserved", "Active", "Completed"] } } },
    {
      $group: {
        _id: "$vehicleId",
        bookingCount: { $sum: 1 },
        totalHours: {
          $sum: {
            $divide: [
              { $subtract: ["$requestedEndTime", "$requestedStartTime"] },
              1000 * 60 * 60,
            ],
          },
        },
        lastBookedAt: { $max: "$requestedStartTime" },
      },
    },
  ]);

  const utilizationByVehicleId = new Map(
    utilization.map((entry) => [String(entry._id), entry]),
  );

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

  const vehicleReport = vehicles
    .map((vehicle) => {
      const stats = utilizationByVehicleId.get(String(vehicle._id));
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

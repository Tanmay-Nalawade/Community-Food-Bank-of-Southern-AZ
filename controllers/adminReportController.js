const Vehicle = require("../models/vehicle");
const Reservation = require("../models/reservation");
const AccessLog = require("../models/accessLog");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

  const accessLogs = await AccessLog.find({})
    .populate("userId", "firstName lastName email")
    .populate("vehicleId", "make model licensePlate")
    .sort({ createdAt: -1 })
    .limit(100);

  res.render("admin/reports/index", {
    title: "Reports",
    vehicleReport,
    accessLogs,
    activeNav: "admin",
  });
};

const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");

const OUT_OF_SERVICE_STATUSES = ["Maintenance", "Out of Service"];

exports.index = async (req, res) => {
  const now = new Date();

  const [pendingCount, ongoingCount, upcomingCount, vehicles, pendingReservations] =
    await Promise.all([
      Reservation.countDocuments({ status: "Pending" }),
      Reservation.countDocuments({ status: "Active" }),
      Reservation.countDocuments({ status: "Reserved", requestedStartTime: { $gt: now } }),
      Vehicle.find({}, "make model year status activeIssues").populate(
        "activeIssues.reportedBy",
        "firstName lastName",
      ),
      Reservation.find({ status: "Pending" })
        .populate("userId", "firstName lastName")
        .populate("vehicleId", "make model year")
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

  const unresolvedIssues = [];
  vehicles.forEach((vehicle) => {
    vehicle.activeIssues.forEach((issue) => {
      if (!issue.reviewed) {
        unresolvedIssues.push({ vehicle, issue });
      }
    });
  });

  const vehiclesNeedingAttention = vehicles.filter((vehicle) =>
    OUT_OF_SERVICE_STATUSES.includes(vehicle.status),
  ).length;

  const notifications = [
    ...pendingReservations
      .filter((reservation) => reservation.userId && reservation.vehicleId)
      .map((reservation) => ({
        type: "booking",
        message: `${reservation.userId.firstName} ${reservation.userId.lastName} requested the ${
          reservation.vehicleId.year ? reservation.vehicleId.year + " " : ""
        }${reservation.vehicleId.make} ${reservation.vehicleId.model}`,
        link: `/admin/reservations/${reservation._id}`,
        at: reservation.createdAt,
      })),
    ...unresolvedIssues.map(({ vehicle, issue }) => ({
      type: "issue",
      message: `${
        issue.reportedBy ? `${issue.reportedBy.firstName} ${issue.reportedBy.lastName}` : "Someone"
      } reported an issue with the ${vehicle.make} ${vehicle.model}: "${issue.description}"`,
      link: "/admin/issues",
      at: issue.reportedAt,
    })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 15);

  res.render("admin/dashboard", {
    title: "Admin Dashboard",
    stats: {
      pending: pendingCount,
      ongoing: ongoingCount,
      upcoming: upcomingCount,
      unresolvedIssues: unresolvedIssues.length,
      vehiclesNeedingAttention,
    },
    notifications,
    activeNav: "admin-dashboard",
  });
};

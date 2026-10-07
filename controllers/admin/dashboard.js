const { Op } = require("sequelize");
const { Reservation, Vehicle, VehicleIssue } = require("../../models");

const OUT_OF_SERVICE_STATUSES = ["Maintenance", "Out of Service"];

exports.index = async (req, res) => {
  const now = new Date();

  const [
    pendingCount,
    ongoingCount,
    upcomingCount,
    vehiclesNeedingAttention,
    unresolvedIssues,
    pendingReservations,
  ] = await Promise.all([
    Reservation.count({ where: { status: "Pending" } }),
    Reservation.count({ where: { status: "Active" } }),
    Reservation.count({ where: { status: "Reserved", requestedStartTime: { [Op.gt]: now } } }),
    Vehicle.count({ where: { status: { [Op.in]: OUT_OF_SERVICE_STATUSES } } }),
    VehicleIssue.findAll({
      where: { reviewed: false },
      include: [
        { association: "vehicle", attributes: ["id", "make", "model", "year", "status"] },
        { association: "reportedBy", attributes: ["id", "firstName", "lastName"] },
      ],
    }),
    Reservation.findAll({
      where: { status: "Pending" },
      include: [
        { association: "user", attributes: ["id", "firstName", "lastName"] },
        { association: "vehicle", attributes: ["id", "make", "model", "year"] },
      ],
      order: [["createdAt", "DESC"], ["id", "DESC"]],
      limit: 10,
    }),
  ]);

  const notifications = [
    ...pendingReservations
      .filter((reservation) => reservation.user && reservation.vehicle)
      .map((reservation) => ({
        type: "booking",
        message: `${reservation.user.firstName} ${reservation.user.lastName} requested the ${
          reservation.vehicle.year ? reservation.vehicle.year + " " : ""
        }${reservation.vehicle.make} ${reservation.vehicle.model}`,
        link: `/admin/reservations/${reservation.id}`,
        at: reservation.createdAt,
      })),
    ...unresolvedIssues.map((issue) => ({
      type: "issue",
      message: `${
        issue.reportedBy ? `${issue.reportedBy.firstName} ${issue.reportedBy.lastName}` : "Someone"
      } reported an issue with the ${issue.vehicle.make} ${issue.vehicle.model}: "${issue.description}"`,
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

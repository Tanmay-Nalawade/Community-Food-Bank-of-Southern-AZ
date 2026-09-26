// Loads every model and wires up the associations between them. Always
// require models from here (not the individual files) so the associations
// are guaranteed to exist before any query uses an `include`.
const { sequelize } = require("../config/db");
const User = require("./user");
const Vehicle = require("./vehicle");
const VehicleIssue = require("./vehicleIssue");
const Reservation = require("./reservation");
const AccessLog = require("./accessLog");
const ActivityLog = require("./activityLog");
const TripLogSend = require("./tripLogSend");

Reservation.belongsTo(User, { as: "user", foreignKey: "userId" });
Reservation.belongsTo(Vehicle, { as: "vehicle", foreignKey: "vehicleId" });
Reservation.belongsTo(User, { as: "reviewedBy", foreignKey: "reviewedById" });
User.hasMany(Reservation, { as: "reservations", foreignKey: "userId" });
Vehicle.hasMany(Reservation, { as: "reservations", foreignKey: "vehicleId" });

Vehicle.hasMany(VehicleIssue, { as: "activeIssues", foreignKey: "vehicleId" });
VehicleIssue.belongsTo(Vehicle, { as: "vehicle", foreignKey: "vehicleId" });
VehicleIssue.belongsTo(User, { as: "reportedBy", foreignKey: "reportedById" });
VehicleIssue.belongsTo(User, { as: "reviewedBy", foreignKey: "reviewedById" });
VehicleIssue.belongsTo(Reservation, { as: "reservation", foreignKey: "reservationId" });

AccessLog.belongsTo(User, { as: "user", foreignKey: "userId" });
AccessLog.belongsTo(Vehicle, { as: "vehicle", foreignKey: "vehicleId" });
AccessLog.belongsTo(Reservation, { as: "reservation", foreignKey: "reservationId" });

ActivityLog.belongsTo(User, { as: "user", foreignKey: "userId" });

TripLogSend.belongsTo(User, { as: "sentBy", foreignKey: "sentById" });

module.exports = {
  sequelize,
  User,
  Vehicle,
  VehicleIssue,
  Reservation,
  AccessLog,
  ActivityLog,
  TripLogSend,
};

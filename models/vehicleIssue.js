const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

// Was the Vehicle.activeIssues embedded array; now one row per issue.
class VehicleIssue extends Model {}

VehicleIssue.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    vehicleId: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    reportedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reportedById: { type: DataTypes.INTEGER },
    reservationId: { type: DataTypes.INTEGER },
    reviewed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reviewedById: { type: DataTypes.INTEGER },
    reviewedAt: { type: DataTypes.DATE },
  },
  {
    sequelize,
    modelName: "VehicleIssue",
    tableName: "vehicle_issues",
    underscored: true,
  },
);

module.exports = VehicleIssue;

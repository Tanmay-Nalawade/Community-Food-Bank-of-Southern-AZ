const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

// Was the Vehicle.activeIssues embedded array; now one row per issue.
class VehicleIssue extends Model {}

VehicleIssue.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    vehicleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    reportedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reportedById: { type: DataTypes.INTEGER.UNSIGNED },
    reservationId: { type: DataTypes.INTEGER.UNSIGNED },
    reviewed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reviewedById: { type: DataTypes.INTEGER.UNSIGNED },
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

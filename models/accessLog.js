const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

class AccessLog extends Model {}

AccessLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    // Nullable so the audit row survives an admin deleting the reservation.
    reservationId: { type: DataTypes.INTEGER.UNSIGNED },
    vehicleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    action: {
      type: DataTypes.ENUM("Granted", "Revoked", "PickedUp", "Returned"),
      allowNull: false,
    },
    accessId: { type: DataTypes.STRING(64) },
    bookingCode: { type: DataTypes.STRING(64) },
  },
  {
    sequelize,
    modelName: "AccessLog",
    tableName: "access_logs",
    underscored: true,
  },
);

module.exports = AccessLog;

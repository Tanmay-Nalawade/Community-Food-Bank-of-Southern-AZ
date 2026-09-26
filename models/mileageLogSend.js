const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

class MileageLogSend extends Model {}

// Unique on (vehicleId, year, month) — see the initial-schema migration —
// so the monthly email is claimed at most once per vehicle per month.
MileageLogSend.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    vehicleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    year: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
    month: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    sentAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    recipient: { type: DataTypes.STRING(255) },
  },
  {
    sequelize,
    modelName: "MileageLogSend",
    tableName: "mileage_log_sends",
    underscored: true,
  },
);

module.exports = MileageLogSend;

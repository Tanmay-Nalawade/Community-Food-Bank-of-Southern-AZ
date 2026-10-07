const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

// History of Trip Log reports an admin has emailed from the Reports page.
class TripLogSend extends Model {}

TripLogSend.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    recipient: { type: DataTypes.STRING(255), allowNull: false },
    fromDate: { type: DataTypes.DATEONLY, allowNull: false },
    toDate: { type: DataTypes.DATEONLY, allowNull: false },
    tripCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    sentById: { type: DataTypes.INTEGER.UNSIGNED },
    sentAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "TripLogSend",
    tableName: "trip_log_sends",
    underscored: true,
  },
);

module.exports = TripLogSend;

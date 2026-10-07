const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

class ActivityLog extends Model {}

ActivityLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.ENUM("Login", "Logout", "RoleSwitch"), allowNull: false },
    detail: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
    ip: { type: DataTypes.STRING(45) },
  },
  {
    sequelize,
    modelName: "ActivityLog",
    tableName: "activity_logs",
    underscored: true,
  },
);

module.exports = ActivityLog;

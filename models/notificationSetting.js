const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

// Recipients for one kind of admin notification email. Read and written
// through services/notificationSettings.js rather than directly.
class NotificationSetting extends Model {
  get recipientList() {
    return this.recipients ? this.recipients.split(",").filter(Boolean) : [];
  }
}

NotificationSetting.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    type: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    recipients: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    updatedById: { type: DataTypes.INTEGER },
  },
  {
    sequelize,
    modelName: "NotificationSetting",
    tableName: "notification_settings",
    underscored: true,
  },
);

module.exports = NotificationSetting;

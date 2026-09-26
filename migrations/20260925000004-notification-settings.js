// Who receives each kind of admin notification email (e.g. "a vehicle
// issue was reported"). Kept in the database rather than .env so admins can
// change the recipients from the app without a redeploy.
const { DataTypes } = require("sequelize");

module.exports = {
  async up({ context: queryInterface }) {
    await queryInterface.createTable(
      "notification_settings",
      {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        // One row per notification type (see services/notificationSettings.js).
        type: { type: DataTypes.STRING(64), allowNull: false, unique: true },
        // Comma-separated, normalized (trimmed, lowercased, de-duplicated).
        recipients: { type: DataTypes.TEXT, allowNull: false },
        updated_by_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      },
      { charset: "utf8mb4", collate: "utf8mb4_unicode_ci", engine: "InnoDB" },
    );
  },

  async down({ context: queryInterface }) {
    await queryInterface.dropTable("notification_settings");
  },
};

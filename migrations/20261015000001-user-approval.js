// New accounts need an Admin's approval before they can log in. Accounts that
// already exist are treated as approved, so nobody using the app today gets
// locked out by this change.
const { DataTypes } = require("sequelize");

module.exports = {
  async up({ context: queryInterface }) {
    await queryInterface.addColumn("users", "is_approved", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.sequelize.query("UPDATE users SET is_approved = 1");
    await queryInterface.addColumn("users", "approved_at", { type: DataTypes.DATE });
    await queryInterface.addColumn("users", "approved_by_id", {
      type: DataTypes.INTEGER,
      references: { model: "users", key: "id" },
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.removeColumn("users", "approved_by_id");
    await queryInterface.removeColumn("users", "approved_at");
    await queryInterface.removeColumn("users", "is_approved");
  },
};

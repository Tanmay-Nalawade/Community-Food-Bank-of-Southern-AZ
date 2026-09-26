// Accounts imported from the old MongoDB app keep their passport-local-
// mongoose password hashes (a 1,024-character key) until each person next
// logs in and is upgraded — see models/user.js. Those don't fit the
// original VARCHAR(255).
const { DataTypes } = require("sequelize");

module.exports = {
  async up({ context: queryInterface }) {
    await queryInterface.changeColumn("users", "password_hash", {
      type: DataTypes.STRING(1200),
      allowNull: false,
    });
  },

  async down({ context: queryInterface }) {
    // Fails if any not-yet-upgraded imported hash is still longer than 255.
    await queryInterface.changeColumn("users", "password_hash", {
      type: DataTypes.STRING(255),
      allowNull: false,
    });
  },
};

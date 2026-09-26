// Admins can log a trip that happened without a booking (someone took a
// vehicle without reserving it). It's stored as an ordinary Completed
// reservation so it flows into the trip log, mileage log and odometer chain
// like any other trip; this flag just marks where it came from. The admin
// who logged it is recorded in the existing reviewed_by_id/reviewed_at.
const { DataTypes } = require("sequelize");

module.exports = {
  async up({ context: queryInterface }) {
    await queryInterface.addColumn("reservations", "is_manual_entry", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down({ context: queryInterface }) {
    await queryInterface.removeColumn("reservations", "is_manual_entry");
  },
};

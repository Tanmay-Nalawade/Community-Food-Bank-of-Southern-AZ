// Staff can log a trip they took without a booking; it's saved with the new
// "Submitted" status and only becomes a Completed trip (counted in reports
// and the odometer chain) once an Admin approves it.
//
// Sequelize creates an ENUM column on SQL Server as NVARCHAR + an unnamed
// CHECK constraint, so the old constraint is looked up by its definition,
// dropped, and replaced with a named one that allows "Submitted".
//
// logged_by_id records who entered a manual trip (the admin who logged it,
// or the driver who submitted it) — reviewed_by_id alone can't tell those
// apart once a submitted trip has been approved.
const { DataTypes } = require("sequelize");

const OLD_STATUSES = ["Pending", "Reserved", "Active", "Completed", "Cancelled", "Denied"];
const NEW_STATUSES = [...OLD_STATUSES, "Submitted"];
const CONSTRAINT = "ck_reservations_status";

async function replaceStatusCheck(sequelize, statuses) {
  const [rows] = await sequelize.query(
    "SELECT cc.name FROM sys.check_constraints cc " +
      "WHERE cc.parent_object_id = OBJECT_ID('reservations') " +
      "AND cc.definition LIKE '%Pending%' AND cc.definition LIKE '%Denied%'",
  );
  for (const { name } of rows) {
    await sequelize.query(`ALTER TABLE reservations DROP CONSTRAINT [${name}]`);
  }
  const list = statuses.map((status) => `N'${status}'`).join(", ");
  await sequelize.query(`ALTER TABLE reservations ADD CONSTRAINT ${CONSTRAINT} CHECK ([status] IN (${list}))`);
}

module.exports = {
  async up({ context: queryInterface }) {
    await replaceStatusCheck(queryInterface.sequelize, NEW_STATUSES);

    await queryInterface.addColumn("reservations", "logged_by_id", {
      type: DataTypes.INTEGER,
      references: { model: "users", key: "id" },
    });
    // Every manual trip so far was logged by an admin, who is its reviewer.
    await queryInterface.sequelize.query(
      "UPDATE reservations SET logged_by_id = reviewed_by_id WHERE is_manual_entry = 1",
    );
  },

  async down({ context: queryInterface }) {
    await queryInterface.removeColumn("reservations", "logged_by_id");
    // A Submitted trip can't exist under the old constraint; treat any left
    // over as rejected rather than silently counting them as trips.
    await queryInterface.sequelize.query("UPDATE reservations SET status = 'Denied' WHERE status = 'Submitted'");
    await replaceStatusCheck(queryInterface.sequelize, OLD_STATUSES);
  },
};

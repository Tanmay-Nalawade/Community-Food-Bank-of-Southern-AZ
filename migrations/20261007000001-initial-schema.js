// Initial Microsoft SQL Server schema. Trip log, KeyCafe access, notification
// and inspection details are columns on reservations; email-verification and
// password-reset tokens are columns on users; vehicle issues have their own
// vehicle_issues table.
//
// Foreign keys all use SQL Server's default (NO ACTION): SQL Server rejects
// cascading/SET NULL actions that could reach a table along more than one
// path (vehicle_issues alone has three references to users). Rows are never
// deleted out from under a reference anyway — users and vehicles aren't
// deleted in the app, and deleting a reservation unlinks its logs/issues
// first (controllers/admin/reservation.js).
const { DataTypes } = require("sequelize");

const id = () => ({ type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true });

const fk = (table, { allowNull = false } = {}) => ({
  type: DataTypes.INTEGER,
  allowNull,
  references: { model: table, key: "id" },
});

const timestamps = () => ({
  created_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false },
});

const RESERVATION_STATUSES = ["Pending", "Reserved", "Active", "Completed", "Cancelled", "Denied"];

module.exports = {
  async up({ context: queryInterface }) {
    const { sequelize } = queryInterface;

    await queryInterface.createTable("users", {
      id: id(),
      first_name: { type: DataTypes.STRING(100), allowNull: false },
      last_name: { type: DataTypes.STRING(100), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      role: { type: DataTypes.ENUM("Staff", "Admin", "IT Admin"), allowNull: false, defaultValue: "Staff" },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // "pbkdf2_sha256$<iterations>$<salt>$<hash>" — see models/user.js.
      password_hash: { type: DataTypes.STRING(1200), allowNull: false },
      email_verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      email_verification_token_hash: { type: DataTypes.CHAR(64) },
      email_verification_expires_at: { type: DataTypes.DATE },
      password_reset_token_hash: { type: DataTypes.CHAR(64) },
      password_reset_expires_at: { type: DataTypes.DATE },
      ...timestamps(),
    });
    await queryInterface.addIndex("users", ["email_verification_token_hash"]);
    await queryInterface.addIndex("users", ["password_reset_token_hash"]);

    await queryInterface.createTable("vehicles", {
      id: id(),
      make: { type: DataTypes.STRING(100), allowNull: false },
      model: { type: DataTypes.STRING(100), allowNull: false },
      year: { type: DataTypes.SMALLINT },
      license_plate: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      key_cafe_key_id: { type: DataTypes.STRING(64), allowNull: false },
      key_cafe_access_valid: { type: DataTypes.BOOLEAN },
      key_cafe_access_checked_at: { type: DataTypes.DATE },
      photo_url: { type: DataTypes.STRING(2048), allowNull: false, defaultValue: "" },
      current_mileage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      next_maintenance_due_mileage: { type: DataTypes.INTEGER },
      next_maintenance_due_date: { type: DataTypes.DATE },
      status: {
        type: DataTypes.ENUM("Available", "Reserved", "In Use", "Maintenance", "Out of Service"),
        allowNull: false,
        defaultValue: "Available",
      },
      ...timestamps(),
    });

    await queryInterface.createTable("reservations", {
      id: id(),
      user_id: fk("users"),
      vehicle_id: fk("vehicles"),
      requested_start_time: { type: DataTypes.DATE, allowNull: false },
      requested_end_time: { type: DataTypes.DATE, allowNull: false },
      status: { type: DataTypes.ENUM(...RESERVATION_STATUSES), allowNull: false, defaultValue: "Pending" },
      staff_notes: { type: DataTypes.TEXT, allowNull: false },
      admin_notes: { type: DataTypes.TEXT, allowNull: false },
      trip_food_related: { type: DataTypes.ENUM("Yes", "No", "Other") },
      trip_food_related_detail: { type: DataTypes.TEXT, allowNull: false },
      reviewed_by_id: fk("users", { allowNull: true }),
      reviewed_at: { type: DataTypes.DATE },
      // Logged by an admin after the fact (no booking / KeyCafe access).
      is_manual_entry: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      key_cafe_booking_code: { type: DataTypes.STRING(64) },
      key_cafe_access_id: { type: DataTypes.STRING(64) },
      key_cafe_checkin_link: { type: DataTypes.STRING(2048) },
      key_picked_up_at: { type: DataTypes.DATE },
      key_returned_at: { type: DataTypes.DATE },

      trip_started_at: { type: DataTypes.DATE },
      trip_ended_at: { type: DataTypes.DATE },
      start_mileage: { type: DataTypes.INTEGER },
      end_mileage: { type: DataTypes.INTEGER },
      pre_trip_inspection_passed: { type: DataTypes.BOOLEAN },
      fuel_level_end_percent: { type: DataTypes.TINYINT },
      dropped_off_food: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      picked_up_food: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      other_duty: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      other_duty_note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
      washed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      confirmation_sent_at: { type: DataTypes.DATE },
      reminder_3day_sent_at: { type: DataTypes.DATE },
      reminder_final_sent_at: { type: DataTypes.DATE },

      inspection_completed_at: { type: DataTypes.DATE },
      inspection_skipped: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      inspection_condition_satisfactory: { type: DataTypes.BOOLEAN },
      inspection_remarks: { type: DataTypes.TEXT, allowNull: false },

      ...timestamps(),
    });

    await sequelize.query(
      "ALTER TABLE reservations ADD CONSTRAINT chk_reservations_fuel_pct " +
        "CHECK (fuel_level_end_percent IS NULL OR fuel_level_end_percent BETWEEN 0 AND 100)",
    );
    await sequelize.query(
      "ALTER TABLE reservations ADD CONSTRAINT chk_reservations_mileage " +
        "CHECK ((start_mileage IS NULL OR start_mileage >= 0) AND (end_mileage IS NULL OR end_mileage >= 0))",
    );
    await queryInterface.addIndex("reservations", ["vehicle_id", "requested_start_time", "requested_end_time"]);
    await queryInterface.addIndex("reservations", ["user_id", "status", "requested_start_time"]);
    await queryInterface.addIndex("reservations", ["status", "requested_start_time"]);
    await queryInterface.addIndex("reservations", ["key_cafe_access_id"]);
    // "No two identical open bookings" backstop: unique only among
    // non-terminal reservations, so a Completed/Cancelled/Denied one doesn't
    // block rebooking the exact same vehicle/window later.
    await sequelize.query(
      "CREATE UNIQUE INDEX uniq_reservations_open_duplicate " +
        "ON reservations (user_id, vehicle_id, requested_start_time, requested_end_time) " +
        "WHERE status IN ('Pending', 'Reserved', 'Active')",
    );

    await queryInterface.createTable("vehicle_issues", {
      id: id(),
      vehicle_id: fk("vehicles"),
      description: { type: DataTypes.TEXT, allowNull: false },
      reported_at: { type: DataTypes.DATE, allowNull: false },
      reported_by_id: fk("users", { allowNull: true }),
      reservation_id: fk("reservations", { allowNull: true }),
      reviewed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      reviewed_by_id: fk("users", { allowNull: true }),
      reviewed_at: { type: DataTypes.DATE },
      ...timestamps(),
    });
    await queryInterface.addIndex("vehicle_issues", ["reviewed", "reported_at"]);
    await queryInterface.addIndex("vehicle_issues", ["vehicle_id"]);

    await queryInterface.createTable("access_logs", {
      id: id(),
      // Kept (unlinked) when an admin deletes the reservation.
      reservation_id: fk("reservations", { allowNull: true }),
      vehicle_id: fk("vehicles"),
      user_id: fk("users"),
      action: { type: DataTypes.ENUM("Granted", "Revoked", "PickedUp", "Returned"), allowNull: false },
      access_id: { type: DataTypes.STRING(64) },
      booking_code: { type: DataTypes.STRING(64) },
      ...timestamps(),
    });
    await queryInterface.addIndex("access_logs", ["created_at"]);

    await queryInterface.createTable("activity_logs", {
      id: id(),
      user_id: fk("users"),
      action: { type: DataTypes.ENUM("Login", "Logout", "RoleSwitch"), allowNull: false },
      detail: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
      ip: { type: DataTypes.STRING(45) },
      ...timestamps(),
    });
    await queryInterface.addIndex("activity_logs", ["created_at"]);

    // History of Trip Log emails sent from the Reports page.
    await queryInterface.createTable("trip_log_sends", {
      id: id(),
      recipient: { type: DataTypes.STRING(255), allowNull: false },
      from_date: { type: DataTypes.DATEONLY, allowNull: false },
      to_date: { type: DataTypes.DATEONLY, allowNull: false },
      trip_count: { type: DataTypes.INTEGER, allowNull: false },
      sent_by_id: fk("users", { allowNull: true }),
      sent_at: { type: DataTypes.DATE, allowNull: false },
      ...timestamps(),
    });
    await queryInterface.addIndex("trip_log_sends", ["sent_at"]);

    // Who receives each notification email (set by IT Admins).
    await queryInterface.createTable("notification_settings", {
      id: id(),
      type: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      // Comma-separated, normalized addresses.
      recipients: { type: DataTypes.TEXT, allowNull: false },
      updated_by_id: fk("users", { allowNull: true }),
      ...timestamps(),
    });

    // Login sessions (connect-session-sequelize, models/session.js).
    await queryInterface.createTable("sessions", {
      sid: { type: DataTypes.STRING(255), primaryKey: true },
      expires: { type: DataTypes.DATE },
      data: { type: DataTypes.TEXT },
      ...timestamps(),
    });
    await queryInterface.addIndex("sessions", ["expires"]);
  },

  async down({ context: queryInterface }) {
    for (const table of [
      "sessions",
      "notification_settings",
      "trip_log_sends",
      "activity_logs",
      "access_logs",
      "vehicle_issues",
      "reservations",
      "vehicles",
      "users",
    ]) {
      await queryInterface.dropTable(table);
    }
  },
};

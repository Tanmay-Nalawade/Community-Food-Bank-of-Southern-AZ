// Initial MySQL schema — the relational equivalent of the old Mongoose
// collections. Embedded sub-documents (Reservation.tripLog/keyCafeAccess/
// notifications/vehicleInspection, User.emailVerification/passwordReset)
// are flattened into columns on their parent table; Vehicle.activeIssues
// becomes its own vehicle_issues table.
const { DataTypes } = require("sequelize");

const id = () => ({
  type: DataTypes.INTEGER.UNSIGNED,
  autoIncrement: true,
  primaryKey: true,
});

const fk = (table, { allowNull = false, onDelete = "RESTRICT" } = {}) => ({
  type: DataTypes.INTEGER.UNSIGNED,
  allowNull,
  references: { model: table, key: "id" },
  onUpdate: "CASCADE",
  onDelete,
});

const timestamps = () => ({
  created_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false },
});

const TABLE_OPTIONS = { charset: "utf8mb4", collate: "utf8mb4_unicode_ci", engine: "InnoDB" };

const RESERVATION_STATUSES = ["Pending", "Reserved", "Active", "Completed", "Cancelled", "Denied"];

module.exports = {
  async up({ context: queryInterface }) {
    const { sequelize } = queryInterface;

    await queryInterface.createTable(
      "users",
      {
        id: id(),
        first_name: { type: DataTypes.STRING(100), allowNull: false },
        last_name: { type: DataTypes.STRING(100), allowNull: false },
        email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        role: {
          type: DataTypes.ENUM("Staff", "Admin", "IT Admin"),
          allowNull: false,
          defaultValue: "Staff",
        },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        password_hash: { type: DataTypes.STRING(255), allowNull: false },
        email_verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        email_verification_token_hash: { type: DataTypes.CHAR(64) },
        email_verification_expires_at: { type: DataTypes.DATE },
        password_reset_token_hash: { type: DataTypes.CHAR(64) },
        password_reset_expires_at: { type: DataTypes.DATE },
        ...timestamps(),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex("users", ["email_verification_token_hash"]);
    await queryInterface.addIndex("users", ["password_reset_token_hash"]);

    await queryInterface.createTable(
      "vehicles",
      {
        id: id(),
        make: { type: DataTypes.STRING(100), allowNull: false },
        model: { type: DataTypes.STRING(100), allowNull: false },
        year: { type: DataTypes.SMALLINT.UNSIGNED },
        license_plate: { type: DataTypes.STRING(20), allowNull: false, unique: true },
        key_cafe_key_id: { type: DataTypes.STRING(64), allowNull: false },
        key_cafe_access_valid: { type: DataTypes.BOOLEAN },
        key_cafe_access_checked_at: { type: DataTypes.DATE },
        photo_url: { type: DataTypes.STRING(2048), allowNull: false, defaultValue: "" },
        current_mileage: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        next_maintenance_due_mileage: { type: DataTypes.INTEGER.UNSIGNED },
        next_maintenance_due_date: { type: DataTypes.DATE },
        status: {
          type: DataTypes.ENUM("Available", "Reserved", "In Use", "Maintenance", "Out of Service"),
          allowNull: false,
          defaultValue: "Available",
        },
        ...timestamps(),
      },
      TABLE_OPTIONS,
    );

    await queryInterface.createTable(
      "reservations",
      {
        id: id(),
        user_id: fk("users"),
        vehicle_id: fk("vehicles"),
        requested_start_time: { type: DataTypes.DATE, allowNull: false },
        requested_end_time: { type: DataTypes.DATE, allowNull: false },
        status: {
          type: DataTypes.ENUM(...RESERVATION_STATUSES),
          allowNull: false,
          defaultValue: "Pending",
        },
        staff_notes: { type: DataTypes.TEXT, allowNull: false },
        admin_notes: { type: DataTypes.TEXT, allowNull: false },
        trip_food_related: { type: DataTypes.ENUM("Yes", "No", "Other") },
        trip_food_related_detail: { type: DataTypes.TEXT, allowNull: false },
        reviewed_by_id: fk("users", { allowNull: true, onDelete: "SET NULL" }),
        reviewed_at: { type: DataTypes.DATE },

        // was keyCafeAccess.*
        key_cafe_booking_code: { type: DataTypes.STRING(64) },
        key_cafe_access_id: { type: DataTypes.STRING(64) },
        key_cafe_checkin_link: { type: DataTypes.STRING(2048) },
        key_picked_up_at: { type: DataTypes.DATE },
        key_returned_at: { type: DataTypes.DATE },

        // was tripLog.*
        trip_started_at: { type: DataTypes.DATE },
        trip_ended_at: { type: DataTypes.DATE },
        start_mileage: { type: DataTypes.INTEGER.UNSIGNED },
        end_mileage: { type: DataTypes.INTEGER.UNSIGNED },
        pre_trip_inspection_passed: { type: DataTypes.BOOLEAN },
        fuel_level_end_percent: { type: DataTypes.TINYINT.UNSIGNED },
        dropped_off_food: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        picked_up_food: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        other_duty: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        other_duty_note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
        washed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

        // was notifications.*
        confirmation_sent_at: { type: DataTypes.DATE },
        reminder_3day_sent_at: { type: DataTypes.DATE },
        reminder_final_sent_at: { type: DataTypes.DATE },

        // was vehicleInspection.*
        inspection_completed_at: { type: DataTypes.DATE },
        inspection_skipped: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        inspection_condition_satisfactory: { type: DataTypes.BOOLEAN },
        inspection_remarks: { type: DataTypes.TEXT, allowNull: false },

        ...timestamps(),
      },
      TABLE_OPTIONS,
    );

    await sequelize.query(
      "ALTER TABLE reservations ADD CONSTRAINT chk_reservations_fuel_pct " +
        "CHECK (fuel_level_end_percent IS NULL OR fuel_level_end_percent <= 100)",
    );

    await queryInterface.addIndex("reservations", [
      "vehicle_id",
      "requested_start_time",
      "requested_end_time",
    ]);
    await queryInterface.addIndex("reservations", ["user_id", "status", "requested_start_time"]);
    await queryInterface.addIndex("reservations", ["status", "requested_start_time"]);
    await queryInterface.addIndex("reservations", ["key_cafe_access_id"]);

    // MySQL has no partial indexes, so the old Mongo
    // { unique, partialFilterExpression: { status: { $in: [...] } } } is
    // emulated with a generated column that is 1 for a non-terminal
    // reservation and NULL otherwise — NULLs never collide in a unique
    // index, so Completed/Cancelled/Denied rows don't block a rebook of the
    // exact same vehicle/window.
    await sequelize.query(
      "ALTER TABLE reservations ADD COLUMN open_slot TINYINT " +
        "AS (IF(status IN ('Pending','Reserved','Active'), 1, NULL)) STORED",
    );
    await queryInterface.addIndex(
      "reservations",
      ["user_id", "vehicle_id", "requested_start_time", "requested_end_time", "open_slot"],
      { unique: true, name: "uniq_reservations_open_duplicate" },
    );

    await queryInterface.createTable(
      "vehicle_issues",
      {
        id: id(),
        vehicle_id: fk("vehicles", { onDelete: "CASCADE" }),
        description: { type: DataTypes.TEXT, allowNull: false },
        reported_at: { type: DataTypes.DATE, allowNull: false },
        reported_by_id: fk("users", { allowNull: true, onDelete: "SET NULL" }),
        reservation_id: fk("reservations", { allowNull: true, onDelete: "SET NULL" }),
        reviewed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        reviewed_by_id: fk("users", { allowNull: true, onDelete: "SET NULL" }),
        reviewed_at: { type: DataTypes.DATE },
        ...timestamps(),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex("vehicle_issues", ["reviewed", "reported_at"]);

    await queryInterface.createTable(
      "access_logs",
      {
        id: id(),
        // Audit rows outlive an admin deleting the reservation they refer to.
        reservation_id: fk("reservations", { allowNull: true, onDelete: "SET NULL" }),
        vehicle_id: fk("vehicles"),
        user_id: fk("users"),
        action: {
          type: DataTypes.ENUM("Granted", "Revoked", "PickedUp", "Returned"),
          allowNull: false,
        },
        access_id: { type: DataTypes.STRING(64) },
        booking_code: { type: DataTypes.STRING(64) },
        ...timestamps(),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex("access_logs", ["created_at"]);

    await queryInterface.createTable(
      "activity_logs",
      {
        id: id(),
        user_id: fk("users"),
        action: { type: DataTypes.ENUM("Login", "Logout", "RoleSwitch"), allowNull: false },
        detail: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
        ip: { type: DataTypes.STRING(45) },
        ...timestamps(),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex("activity_logs", ["created_at"]);

    await queryInterface.createTable(
      "mileage_log_sends",
      {
        id: id(),
        vehicle_id: fk("vehicles", { onDelete: "CASCADE" }),
        year: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
        month: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
        sent_at: { type: DataTypes.DATE, allowNull: false },
        recipient: { type: DataTypes.STRING(255) },
        ...timestamps(),
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex("mileage_log_sends", ["vehicle_id", "year", "month"], {
      unique: true,
    });

    // Schema expected by express-mysql-session (its createDatabaseTable is
    // turned off in app.js so this migration owns the table definition).
    await sequelize.query(`
      CREATE TABLE sessions (
        session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
        expires INT UNSIGNED NOT NULL,
        data MEDIUMTEXT COLLATE utf8mb4_bin,
        PRIMARY KEY (session_id),
        KEY idx_sessions_expires (expires)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  },

  async down({ context: queryInterface }) {
    for (const table of [
      "sessions",
      "mileage_log_sends",
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

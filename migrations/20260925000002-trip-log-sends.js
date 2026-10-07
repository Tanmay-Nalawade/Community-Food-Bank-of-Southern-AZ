// Reports are no longer emailed automatically. The per-vehicle monthly
// mileage log email (and its once-per-month dedupe table) is gone; instead
// an admin emails the fleet-wide Trip Log for a date range on demand, and
// each send is recorded here.
const { DataTypes } = require("sequelize");

const TABLE_OPTIONS = { charset: "utf8mb4", collate: "utf8mb4_unicode_ci", engine: "InnoDB" };

module.exports = {
  async up({ context: queryInterface }) {
    await queryInterface.dropTable("mileage_log_sends");

    await queryInterface.createTable(
      "trip_log_sends",
      {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        recipient: { type: DataTypes.STRING(255), allowNull: false },
        from_date: { type: DataTypes.DATEONLY, allowNull: false },
        to_date: { type: DataTypes.DATEONLY, allowNull: false },
        trip_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        sent_by_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        sent_at: { type: DataTypes.DATE, allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex("trip_log_sends", ["sent_at"]);
  },

  async down({ context: queryInterface }) {
    await queryInterface.dropTable("trip_log_sends");

    await queryInterface.createTable(
      "mileage_log_sends",
      {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        vehicle_id: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          references: { model: "vehicles", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        year: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false },
        month: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
        sent_at: { type: DataTypes.DATE, allowNull: false },
        recipient: { type: DataTypes.STRING(255) },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      },
      TABLE_OPTIONS,
    );
    await queryInterface.addIndex("mileage_log_sends", ["vehicle_id", "year", "month"], {
      unique: true,
    });
  },
};

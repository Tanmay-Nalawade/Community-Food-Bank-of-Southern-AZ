const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

class Vehicle extends Model {}

Vehicle.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    make: { type: DataTypes.STRING(100), allowNull: false },
    model: { type: DataTypes.STRING(100), allowNull: false },
    year: { type: DataTypes.SMALLINT },
    // uppercase+trim so "abc-1234" and "ABC-1234" collide as the same plate
    // instead of slipping past the unique index as two "different" vehicles.
    licensePlate: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue("licensePlate", String(value ?? "").trim().toUpperCase());
      },
    },

    keyCafeKeyId: { type: DataTypes.STRING(64), allowNull: false },

    // Only set when an admin runs "Check KeyCafe Access" on the API Status
    // page — a live lookup against KeyCafe's own key list. Never refreshed
    // automatically (that would mean an external API call on every page
    // load), so this can go stale if the key is later deleted in KeyCafe.
    keyCafeAccessValid: { type: DataTypes.BOOLEAN },
    keyCafeAccessCheckedAt: { type: DataTypes.DATE },

    photoUrl: { type: DataTypes.STRING(2048), allowNull: false, defaultValue: "" },

    currentMileage: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    nextMaintenanceDueMileage: { type: DataTypes.INTEGER },
    nextMaintenanceDueDate: { type: DataTypes.DATE },

    status: {
      type: DataTypes.ENUM("Available", "Reserved", "In Use", "Maintenance", "Out of Service"),
      allowNull: false,
      defaultValue: "Available",
    },
  },
  {
    sequelize,
    modelName: "Vehicle",
    tableName: "vehicles",
    underscored: true,
  },
);

module.exports = Vehicle;

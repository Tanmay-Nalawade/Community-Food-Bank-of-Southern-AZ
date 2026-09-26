const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../config/db");

const STATUSES = ["Pending", "Reserved", "Active", "Completed", "Cancelled", "Denied"];
// Statuses that still hold (or are asking to hold) a vehicle's time slot.
const OPEN_STATUSES = ["Pending", "Reserved", "Active"];

class Reservation extends Model {}

Reservation.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    vehicleId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

    requestedStartTime: { type: DataTypes.DATE, allowNull: false },
    requestedEndTime: { type: DataTypes.DATE, allowNull: false },

    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: "Pending" },

    staffNotes: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    adminNotes: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },

    tripFoodRelated: { type: DataTypes.ENUM("Yes", "No", "Other") },
    tripFoodRelatedDetail: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },

    reviewedById: { type: DataTypes.INTEGER.UNSIGNED },
    reviewedAt: { type: DataTypes.DATE },

    // KeyCafe access (was keyCafeAccess.*)
    keyCafeBookingCode: { type: DataTypes.STRING(64) },
    keyCafeAccessId: { type: DataTypes.STRING(64) },
    keyCafeCheckinLink: { type: DataTypes.STRING(2048) },
    keyPickedUpAt: { type: DataTypes.DATE },
    keyReturnedAt: { type: DataTypes.DATE },

    // Trip log (was tripLog.*)
    tripStartedAt: { type: DataTypes.DATE },
    tripEndedAt: { type: DataTypes.DATE },
    startMileage: { type: DataTypes.INTEGER.UNSIGNED },
    endMileage: { type: DataTypes.INTEGER.UNSIGNED },
    preTripInspectionPassed: { type: DataTypes.BOOLEAN },
    fuelLevelEndPercent: {
      type: DataTypes.TINYINT.UNSIGNED,
      validate: { min: 0, max: 100 },
    },
    droppedOffFood: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    pickedUpFood: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    otherDuty: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    otherDutyNote: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
    washed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Email notifications (was notifications.*)
    confirmationSentAt: { type: DataTypes.DATE },
    reminder3DaySentAt: { type: DataTypes.DATE, field: "reminder_3day_sent_at" },
    reminderFinalSentAt: { type: DataTypes.DATE },

    // Return-vehicle inspection (was vehicleInspection.*)
    inspectionCompletedAt: { type: DataTypes.DATE },
    inspectionSkipped: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    inspectionConditionSatisfactory: { type: DataTypes.BOOLEAN },
    inspectionRemarks: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
  },
  {
    sequelize,
    modelName: "Reservation",
    tableName: "reservations",
    underscored: true,
    // The unique "no identical open duplicate" backstop is enforced in the
    // database via the generated open_slot column — see the initial-schema
    // migration. It isn't mapped here since it's computed by MySQL.
  },
);

Reservation.STATUSES = STATUSES;
Reservation.OPEN_STATUSES = OPEN_STATUSES;

module.exports = Reservation;

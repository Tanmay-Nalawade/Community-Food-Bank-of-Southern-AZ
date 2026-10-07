// One-time import of data exported from the old MongoDB app (an Extended
// JSON file, see legacy-export/) into the MySQL database in .env.
//
//   node scripts/import-legacy-data.js <export.json> [--replace]
//
// Needs no MongoDB driver — the export is plain JSON. Refuses to touch a
// database that already has users/vehicles/reservations unless --replace is
// given, in which case every app table is emptied first (like the seed).
// Login sessions and one-time email tokens aren't imported: people just log
// in again. Passwords carry over (see models/user.js) and are upgraded to
// the current hashing on each person's next login.
const fs = require("fs");
const path = require("path");
const { connect } = require("../config/db");
const migrator = require("../config/migrator");
const {
  sequelize,
  User,
  Vehicle,
  VehicleIssue,
  Reservation,
  AccessLog,
  ActivityLog,
} = require("../models");

const APP_TABLES = [
  "sessions",
  "notification_settings",
  "trip_log_sends",
  "vehicle_issues",
  "access_logs",
  "activity_logs",
  "reservations",
  "vehicles",
  "users",
];

// Decodes the canonical Extended JSON wrappers mongoexport/EJSON write.
function reviveEjson(key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if ("$oid" in value) return value.$oid;
    if ("$date" in value) {
      const d = value.$date;
      return new Date(typeof d === "object" ? Number(d.$numberLong) : d);
    }
    if ("$numberInt" in value) return Number(value.$numberInt);
    if ("$numberLong" in value) return Number(value.$numberLong);
    if ("$numberDouble" in value) return Number(value.$numberDouble);
    if ("$numberDecimal" in value) return Number(value.$numberDecimal);
  }
  return value;
}

const nn = (value) => (value === undefined ? null : value);

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: node scripts/import-legacy-data.js <export.json> [--replace]");
    process.exit(1);
  }
  const replace = flags.includes("--replace");
  const data = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"), reviveEjson);
  const col = (name) => data.collections?.[name] || [];

  await connect();
  if ((await migrator.pending()).length) {
    throw new Error("Database schema is out of date — run `npm run db:migrate` first.");
  }

  const existing = (await User.count()) + (await Vehicle.count()) + (await Reservation.count());
  if (existing && !replace) {
    throw new Error(
      "The database already has data. Re-run with --replace to empty every app table and import " +
        "the export instead (this deletes what's there now).",
    );
  }

  if (replace) {
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of APP_TABLES) {
      await sequelize.query(`TRUNCATE TABLE \`${table}\``);
    }
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
  }

  const ids = { users: new Map(), vehicles: new Map(), reservations: new Map() };
  const skipped = [];
  const counts = {};
  const opts = (transaction) => ({ transaction, silent: true }); // keep original updatedAt

  await sequelize.transaction(async (transaction) => {
    for (const u of col("users")) {
      const user = await User.create(
        {
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          role: u.role || "Staff",
          isActive: u.isActive ?? true,
          emailVerified: u.emailVerified ?? false,
          // passport-local-mongoose: pbkdf2-sha256, 25,000 iterations,
          // 512-byte key, hex salt used as-is. No hash = can't log in
          // until they use "Forgot password".
          passwordHash: u.hash && u.salt ? `pbkdf2_sha256$25000$${u.salt}$${u.hash}` : "!no-password",
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        },
        opts(transaction),
      );
      ids.users.set(u._id, user.id);
    }
    counts.users = ids.users.size;

    const pendingIssues = [];
    for (const v of col("vehicles")) {
      const vehicle = await Vehicle.create(
        {
          make: v.make,
          model: v.model,
          year: nn(v.year),
          licensePlate: v.licensePlate,
          keyCafeKeyId: v.keyCafeKeyId,
          keyCafeAccessValid: nn(v.keyCafeAccessValid),
          keyCafeAccessCheckedAt: nn(v.keyCafeAccessCheckedAt),
          photoUrl: v.photoUrl || "",
          currentMileage: v.currentMileage ?? 0,
          nextMaintenanceDueMileage: nn(v.nextMaintenanceDueMileage),
          nextMaintenanceDueDate: nn(v.nextMaintenanceDueDate),
          status: v.status || "Available",
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        },
        opts(transaction),
      );
      ids.vehicles.set(v._id, vehicle.id);
      (v.activeIssues || []).forEach((issue) => pendingIssues.push({ vehicleId: vehicle.id, issue }));
    }
    counts.vehicles = ids.vehicles.size;

    for (const r of col("reservations")) {
      const userId = ids.users.get(r.userId);
      const vehicleId = ids.vehicles.get(r.vehicleId);
      if (!userId || !vehicleId) {
        skipped.push(`reservation ${r._id}: its ${userId ? "vehicle" : "user"} no longer exists`);
        continue;
      }
      const access = r.keyCafeAccess || {};
      const trip = r.tripLog || {};
      const notes = r.notifications || {};
      const inspection = r.vehicleInspection || {};
      const reservation = await Reservation.create(
        {
          userId,
          vehicleId,
          requestedStartTime: r.requestedStartTime,
          requestedEndTime: r.requestedEndTime,
          status: r.status || "Pending",
          staffNotes: r.staffNotes || "",
          adminNotes: r.adminNotes || "",
          tripFoodRelated: nn(r.tripFoodRelated),
          tripFoodRelatedDetail: r.tripFoodRelatedDetail || "",
          reviewedById: nn(ids.users.get(r.reviewedBy)),
          reviewedAt: nn(r.reviewedAt),
          keyCafeBookingCode: nn(access.bookingCode),
          keyCafeAccessId: nn(access.accessId),
          keyCafeCheckinLink: nn(access.checkinLink),
          keyPickedUpAt: nn(access.keyPickedUpAt),
          keyReturnedAt: nn(access.keyReturnedAt),
          tripStartedAt: nn(trip.tripStartedAt),
          tripEndedAt: nn(trip.tripEndedAt),
          startMileage: nn(trip.startMileage),
          endMileage: nn(trip.endMileage),
          preTripInspectionPassed: nn(trip.preTripInspectionPassed),
          fuelLevelEndPercent: nn(trip.fuelLevelEndPercent),
          droppedOffFood: Boolean(trip.droppedOffFood),
          pickedUpFood: Boolean(trip.pickedUpFood),
          otherDuty: Boolean(trip.otherDuty),
          otherDutyNote: trip.otherDutyNote || "",
          washed: Boolean(trip.washed),
          confirmationSentAt: nn(notes.confirmationSentAt),
          reminder3DaySentAt: nn(notes.reminder3DaySentAt),
          reminderFinalSentAt: nn(notes.reminderFinalSentAt),
          inspectionCompletedAt: nn(inspection.completedAt),
          inspectionSkipped: Boolean(inspection.skipped),
          inspectionConditionSatisfactory: nn(inspection.conditionSatisfactory),
          inspectionRemarks: inspection.remarks || "",
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        },
        opts(transaction),
      );
      ids.reservations.set(r._id, reservation.id);
    }
    counts.reservations = ids.reservations.size;

    for (const { vehicleId, issue } of pendingIssues) {
      await VehicleIssue.create(
        {
          vehicleId,
          description: issue.description || "",
          reportedAt: issue.reportedAt || new Date(),
          reportedById: nn(ids.users.get(issue.reportedBy)),
          reservationId: nn(ids.reservations.get(issue.reservationId)),
          reviewed: Boolean(issue.reviewed),
          reviewedById: nn(ids.users.get(issue.reviewedBy)),
          reviewedAt: nn(issue.reviewedAt),
        },
        { transaction },
      );
    }
    counts.vehicleIssues = pendingIssues.length;

    counts.accessLogs = 0;
    for (const a of col("accesslogs")) {
      const userId = ids.users.get(a.userId);
      const vehicleId = ids.vehicles.get(a.vehicleId);
      if (!userId || !vehicleId) {
        skipped.push(`access log ${a._id}: its ${userId ? "vehicle" : "user"} no longer exists`);
        continue;
      }
      await AccessLog.create(
        {
          // The reservation may have been deleted by an admin — the audit
          // row is kept, unlinked, same as the MySQL schema does.
          reservationId: nn(ids.reservations.get(a.reservationId)),
          vehicleId,
          userId,
          action: a.action,
          accessId: nn(a.accessId),
          bookingCode: nn(a.bookingCode),
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        },
        opts(transaction),
      );
      counts.accessLogs++;
    }

    counts.activityLogs = 0;
    for (const l of col("activitylogs")) {
      const userId = ids.users.get(l.userId);
      if (!userId) {
        skipped.push(`activity log ${l._id}: its user no longer exists`);
        continue;
      }
      await ActivityLog.create(
        {
          userId,
          action: l.action,
          detail: l.detail || "",
          ip: nn(l.ip),
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
        },
        opts(transaction),
      );
      counts.activityLogs++;
    }
  });

  console.log(`Imported from ${data.source || file} (exported ${data.exportedAt || "?"}):`);
  Object.entries(counts).forEach(([name, n]) => console.log(`  ${name}: ${n}`));
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} record(s) that pointed at something already deleted:`);
    skipped.forEach((line) => console.log(`  - ${line}`));
  }
  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Import failed:", err.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});

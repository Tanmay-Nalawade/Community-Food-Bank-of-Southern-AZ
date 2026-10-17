// Creates vehicles in the app from the filled-in KeyCafe spreadsheet (see
// scripts/export-keycafe-keys.js), each linked to its EXISTING KeyCafe key —
// no new keys are created. After linking, each key is renamed in KeyCafe to
// the app's format ("2010 Ford Transit (ABC1234)"); if a rename fails, that
// key simply keeps its KeyCafe name.
//
// Checks everything first and changes nothing unless the whole spreadsheet is
// valid. Without --apply it only reports what it would do.
//
// Usage (reads the spreadsheet from a file, or from standard input with "-"):
//   node scripts/import-keycafe-vehicles.js imports/keycafe-vehicles.csv
//   node scripts/import-keycafe-vehicles.js imports/keycafe-vehicles.csv --apply
//   docker compose exec -T app node scripts/import-keycafe-vehicles.js - --apply < imports/keycafe-vehicles.csv
require("dotenv").config();
const fs = require("fs");
const { sequelize, connect } = require("../config/db");
const { Vehicle } = require("../models");
const keycafe = require("../services/keycafe");
const { vehicleKeyName } = require("../services/keycafe/vehicleKeySync");
const { addVehicleSchema } = require("../validators/vehicle");
const { parseCsvObjects } = require("../utils/csv");

const REQUIRED_COLUMNS = ["import", "keycafe_key_id", "make", "model", "license_plate", "current_mileage"];

function readInput(source) {
  return fs.readFileSync(source === "-" ? 0 : source, "utf8");
}

function normalizePlate(value) {
  return String(value || "").trim().toUpperCase();
}

// Excel can save a long number as "1.03E+09" or with a trailing ".0".
function normalizeKeyId(value) {
  const text = String(value || "").trim();
  return /^\d+(\.0+)?$/.test(text) ? text.replace(/\.0+$/, "") : text;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const source = args.find((arg) => arg !== "--apply");

  if (!source) {
    console.error("Usage: node scripts/import-keycafe-vehicles.js <spreadsheet.csv | -> [--apply]");
    process.exit(1);
  }

  if (!keycafe.isConfigured()) {
    console.error("Set KEYCAFE_EMAIL and KEYCAFE_TOKEN in .env before running this script.");
    process.exit(1);
  }

  const records = parseCsvObjects(readInput(source));
  if (!records.length) {
    console.error("The spreadsheet has no rows.");
    process.exit(1);
  }

  const missingColumns = REQUIRED_COLUMNS.filter((column) => !(column in records[0]));
  if (missingColumns.length) {
    console.error(`The spreadsheet is missing column(s): ${missingColumns.join(", ")}.`);
    console.error("Use the spreadsheet made by scripts/export-keycafe-keys.js without renaming its columns.");
    process.exit(1);
  }

  await connect();

  const [liveKeys, existingVehicles] = await Promise.all([
    keycafe.listKeys(),
    Vehicle.findAll({ attributes: ["id", "licensePlate", "keyCafeKeyId"] }),
  ]);
  const liveKeyIds = new Set(liveKeys.map((key) => String(key.id)));
  const vehicleByKeyId = new Map(existingVehicles.map((v) => [String(v.keyCafeKeyId), v]));
  const vehicleByPlate = new Map(existingVehicles.map((v) => [v.licensePlate, v]));

  const errors = [];
  const toCreate = [];
  const seenKeyIds = new Map();
  const seenPlates = new Map();
  let skipped = 0;
  let alreadyImported = 0;

  for (const record of records) {
    const where = `Line ${record.line}${record.keycafe_key_name ? ` (${record.keycafe_key_name})` : ""}`;
    const importFlag = record.import.toLowerCase();

    if (["no", "n", ""].includes(importFlag)) {
      skipped += 1;
      continue;
    }
    if (!["yes", "y"].includes(importFlag)) {
      errors.push(`${where}: "import" must be yes or no.`);
      continue;
    }

    const keyId = normalizeKeyId(record.keycafe_key_id);
    const plate = normalizePlate(record.license_plate);
    const rowErrors = [];

    // Imported by an earlier run (same key, same plate): skip it, so the
    // spreadsheet can be run again after filling in more rows.
    const linkedVehicle = vehicleByKeyId.get(keyId);
    if (linkedVehicle && plate && linkedVehicle.licensePlate === plate) {
      alreadyImported += 1;
      continue;
    }

    const { error: invalid, value } = addVehicleSchema.validate(
      {
        make: record.make,
        model: record.model,
        year: record.year,
        licensePlate: record.license_plate,
        currentMileage: String(record.current_mileage).replace(/,/g, ""),
      },
      { abortEarly: false },
    );
    if (invalid) {
      rowErrors.push(...invalid.details.map((detail) => detail.message));
    }

    if (!/^\d+$/.test(keyId)) {
      rowErrors.push(`keycafe_key_id "${record.keycafe_key_id}" isn't a KeyCafe key id.`);
    } else if (!liveKeyIds.has(keyId)) {
      rowErrors.push(`KeyCafe key ${keyId} doesn't exist in this KeyCafe account.`);
    } else if (vehicleByKeyId.has(keyId)) {
      rowErrors.push(`KeyCafe key ${keyId} is already linked to vehicle ${vehicleByKeyId.get(keyId).id} in the app.`);
    } else if (seenKeyIds.has(keyId)) {
      rowErrors.push(`KeyCafe key ${keyId} is also on line ${seenKeyIds.get(keyId)}.`);
    }

    if (plate) {
      if (vehicleByPlate.has(plate)) {
        rowErrors.push(`License plate ${plate} already belongs to vehicle ${vehicleByPlate.get(plate).id} in the app.`);
      } else if (seenPlates.has(plate)) {
        rowErrors.push(`License plate ${plate} is also on line ${seenPlates.get(plate)}.`);
      }
    }

    seenKeyIds.set(keyId, record.line);
    if (plate) seenPlates.set(plate, record.line);

    if (rowErrors.length) {
      errors.push(...rowErrors.map((message) => `${where}: ${message}`));
      continue;
    }

    toCreate.push({
      make: value.make,
      model: value.model,
      year: value.year ?? null,
      licensePlate: plate,
      currentMileage: value.currentMileage,
      keyCafeKeyId: keyId,
      keyName: record.keycafe_key_name,
    });
  }

  console.log(
    `Rows to import: ${toCreate.length}   Already imported: ${alreadyImported}   ` +
      `Skipped (import = no): ${skipped}   Problems: ${errors.length}`,
  );

  if (errors.length) {
    console.log("\nFix these in the spreadsheet and run the script again. Nothing was changed:");
    errors.forEach((message) => console.log(`  - ${message}`));
    await sequelize.close();
    process.exit(1);
  }

  if (!toCreate.length) {
    console.log("Nothing to import.");
    await sequelize.close();
    return;
  }

  console.log("");
  toCreate.forEach((v) =>
    console.log(`  ${v.keyCafeKeyId}  ${v.keyName || "(no KeyCafe name)"}  →  ${vehicleKeyName(v)}, odometer ${v.currentMileage}`),
  );

  if (!apply) {
    console.log("\nEverything checks out. This was a dry run — nothing was changed.");
    console.log("Run the same command again with --apply to create these vehicles.");
    await sequelize.close();
    return;
  }

  // All vehicles or none: a failure part-way leaves the app as it was.
  const created = await sequelize.transaction(async (transaction) => {
    const vehicles = [];
    for (const v of toCreate) {
      vehicles.push(
        await Vehicle.create(
          {
            make: v.make,
            model: v.model,
            year: v.year,
            licensePlate: v.licensePlate,
            currentMileage: v.currentMileage,
            keyCafeKeyId: v.keyCafeKeyId,
            status: "Available",
          },
          { transaction },
        ),
      );
    }
    return vehicles;
  });

  console.log(`\nCreated ${created.length} vehicle(s), each linked to its existing KeyCafe key.`);

  const keptNames = [];
  for (const vehicle of created) {
    try {
      await keycafe.updateKey(vehicle.keyCafeKeyId, vehicleKeyName(vehicle));
    } catch (error) {
      keptNames.push(`  - ${vehicle.keyCafeKeyId} (${vehicleKeyName(vehicle)}): ${error.message}`);
    }
  }

  console.log(`Renamed ${created.length - keptNames.length} key(s) in KeyCafe to the app's format.`);
  if (keptNames.length) {
    console.log("These keys couldn't be renamed and keep their KeyCafe names (the vehicles are still linked):");
    keptNames.forEach((line) => console.log(line));
  }

  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Import failed:", err.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});

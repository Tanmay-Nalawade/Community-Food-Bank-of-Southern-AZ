// Writes a spreadsheet (CSV) of the KeyCafe keys that aren't linked to a
// vehicle in the app yet, for scripts/import-keycafe-vehicles.js. Year, make
// and model are best guesses read from each key's KeyCafe name/description —
// check them, and fill in license_plate and current_mileage, before importing.
//
// Usage:
//   node scripts/export-keycafe-keys.js imports/keycafe-vehicles.csv
//   docker compose exec -T app node scripts/export-keycafe-keys.js > imports/keycafe-vehicles.csv
require("dotenv").config();
const fs = require("fs");
const { sequelize, connect } = require("../config/db");
const { Vehicle } = require("../models");
const keycafe = require("../services/keycafe");
const { toCsv } = require("../utils/csv");

const COLUMNS = [
  "import",
  "keycafe_key_id",
  "keycafe_key_name",
  "keycafe_description",
  "year",
  "make",
  "model",
  "license_plate",
  "current_mileage",
];

// Spelling in KeyCafe → make as it should appear in the app.
const MAKES = {
  chevrolet: "Chevrolet",
  chevy: "Chevrolet",
  ford: "Ford",
  freightliner: "Freightliner",
  ftlr: "Freightliner",
  hino: "Hino",
  honda: "Honda",
  international: "International",
  mazda: "Mazda",
  nissan: "Nissan",
  ram: "RAM",
  toyota: "Toyota",
};

const COLORS = /\b(silver|white|blue|black|red|gray|grey|green)\b/gi;

function oneLine(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// e.g. "2016 Nissan Altima - 4 Passenger" → { year: 2016, make: "Nissan", model: "Altima" }
function guessVehicle(key) {
  const sources = [oneLine(key.description), oneLine(key.name)].filter(Boolean);
  const guess = { year: "", make: "", model: "" };

  for (const text of sources) {
    // Drop a leading fleet unit number like "2100 - ".
    const withoutUnit = text.replace(/^\d{3,5}\s*-\s*/, "");

    if (!guess.year) {
      const year = withoutUnit.match(/\b(19[89]\d|20\d\d)\b/);
      if (year) guess.year = year[1];
    }

    if (!guess.make) {
      const words = withoutUnit.split(/\s+/);
      const makeIndex = words.findIndex((word) => MAKES[word.toLowerCase().replace(/[^a-z]/g, "")]);
      if (makeIndex !== -1) {
        guess.make = MAKES[words[makeIndex].toLowerCase().replace(/[^a-z]/g, "")];
        guess.model = words
          .slice(makeIndex + 1)
          .join(" ")
          .split(/\s+-\s+|,|\//)[0]
          .replace(/\b(19[89]\d|20\d\d)\b/g, "")
          .replace(COLORS, "")
          .replace(/\(\s*\)/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  return guess;
}

async function main() {
  const outputPath = process.argv[2];

  // The spreadsheet can go to standard output, so keep status messages (such
  // as the database's "connected" line) off it.
  console.log = (...args) => console.error(...args);

  if (!keycafe.isConfigured()) {
    console.error("Set KEYCAFE_EMAIL and KEYCAFE_TOKEN in .env before running this script.");
    process.exit(1);
  }

  await connect();

  const [keys, vehicles] = await Promise.all([
    keycafe.listKeys(),
    Vehicle.findAll({ attributes: ["keyCafeKeyId"] }),
  ]);
  const linkedKeyIds = new Set(vehicles.map((vehicle) => String(vehicle.keyCafeKeyId)));

  const records = keys
    .filter((key) => !linkedKeyIds.has(String(key.id)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "en", { numeric: true }))
    .map((key) => {
      const guess = guessVehicle(key);
      return {
        // A spare key belongs to a vehicle that has its own main key.
        import: /\bspare\b/i.test(`${key.name} ${key.description || ""}`) ? "no" : "yes",
        keycafe_key_id: key.id,
        keycafe_key_name: oneLine(key.name),
        keycafe_description: oneLine(key.description),
        year: guess.year,
        make: guess.make,
        model: guess.model,
        license_plate: "",
        current_mileage: "",
      };
    });

  const csv = toCsv(COLUMNS, records);

  if (outputPath) {
    fs.writeFileSync(outputPath, csv);
    console.error(`Wrote ${records.length} KeyCafe key(s) to ${outputPath}.`);
  } else {
    process.stdout.write(csv);
    console.error(`Wrote ${records.length} KeyCafe key(s).`);
  }

  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Failed to export KeyCafe keys:", err.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});

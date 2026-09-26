require("dotenv").config();
const { connect } = require("../config/db");
const migrator = require("../config/migrator");
const { sequelize, User, Vehicle, VehicleIssue, Reservation } = require("../models");

const SEED_PASSWORD = "password123";
// Every table this seed owns, children before parents.
const TABLES = [
  "sessions",
  "vehicle_issues",
  "access_logs",
  "activity_logs",
  "trip_log_sends",
  "notification_settings",
  "reservations",
  "vehicles",
  "users",
];

function setTime(date, hours, minutes = 0) {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function dayOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function seed() {
  await connect();

  if ((await migrator.pending()).length) {
    throw new Error("Database schema is out of date — run `npm run db:migrate` first.");
  }

  // TRUNCATE (not DELETE) so auto-increment ids restart at 1. Foreign key
  // checks are suspended just for this, since TRUNCATE refuses to run on a
  // table another table references.
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES) {
    await sequelize.query(`TRUNCATE TABLE \`${table}\``);
  }
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");

  // emailVerified: true — these are fake @cfb.example addresses that can't
  // receive a real verification link, so seeded/demo accounts are exempted
  // from the verification gate added for real registrations.
  const users = await Promise.all([
    User.register(
      { firstName: "Jordan", lastName: "Lee", email: "jordan.lee@cfb.example", role: "Staff", emailVerified: true },
      SEED_PASSWORD,
    ),
    User.register(
      { firstName: "Maria", lastName: "Garcia", email: "maria.garcia@cfb.example", role: "Staff", emailVerified: true },
      SEED_PASSWORD,
    ),
    User.register(
      { firstName: "Alex", lastName: "Rivera", email: "alex.rivera@cfb.example", role: "Admin", emailVerified: true },
      SEED_PASSWORD,
    ),
    User.register(
      { firstName: "Sam", lastName: "Okafor", email: "sam.okafor@cfb.example", role: "IT Admin", emailVerified: true },
      SEED_PASSWORD,
    ),
  ]);

  const [jordan, maria] = users;

  // Created one at a time (not bulkCreate) so ids are assigned in this
  // listed order, which the destructuring below relies on.
  const vehicleRows = [
    {
      make: "Ford",
      model: "Transit",
      year: 2022,
      licensePlate: "CFB-1001",
      keyCafeKeyId: "KC-TRANSIT-01",
      photoUrl: "https://placehold.co/600x400?text=Ford+Transit",
      currentMileage: 28450,
      status: "Available",
    },
    {
      make: "Toyota",
      model: "Camry",
      year: 2021,
      licensePlate: "CFB-1002",
      keyCafeKeyId: "KC-CAMRY-01",
      photoUrl: "https://placehold.co/600x400?text=Toyota+Camry",
      currentMileage: 41200,
      status: "Available",
    },
    {
      make: "Chevrolet",
      model: "Silverado",
      year: 2020,
      licensePlate: "CFB-1003",
      keyCafeKeyId: "KC-SILVER-01",
      currentMileage: 53800,
      status: "Reserved",
    },
    {
      make: "Honda",
      model: "Odyssey",
      year: 2019,
      licensePlate: "CFB-1004",
      keyCafeKeyId: "KC-ODY-01",
      currentMileage: 67050,
      status: "In Use",
      nextMaintenanceDueMileage: 70000,
      nextMaintenanceDueDate: dayOffset(45),
    },
    {
      make: "Nissan",
      model: "NV200",
      year: 2018,
      licensePlate: "CFB-1005",
      keyCafeKeyId: "KC-NV200-01",
      currentMileage: 89200,
      status: "Maintenance",
      issues: ["Brake inspection pending"],
    },
    {
      make: "RAM",
      model: "ProMaster",
      year: 2023,
      licensePlate: "CFB-1006",
      keyCafeKeyId: "KC-PRO-01",
      currentMileage: 15600,
      status: "Out of Service",
      issues: ["Awaiting body shop repair"],
    },
    {
      make: "Ford",
      model: "Escape",
      year: 2022,
      licensePlate: "CFB-1007",
      keyCafeKeyId: "KC-ESC-01",
      photoUrl: "https://hips.hearstapps.com/hmg-prod/images/5b51d656-5f8d-4372-9486-df20816494e4.jpg?crop=1xw:0.844xh;0xw,0.146xh",
      currentMileage: 22100,
      status: "Available",
    },
  ];

  const vehicles = [];
  for (const { issues = [], ...fields } of vehicleRows) {
    const vehicle = await Vehicle.create(fields);
    for (const description of issues) {
      await VehicleIssue.create({ vehicleId: vehicle.id, description, reportedAt: new Date() });
    }
    vehicles.push(vehicle);
  }

  const [transit, camry, silverado, odyssey, , , escape] = vehicles;

  const today = dayOffset(0);
  const tomorrow = dayOffset(1);
  const inThreeDays = dayOffset(3);

  await Reservation.bulkCreate([
    {
      userId: jordan.id,
      vehicleId: silverado.id,
      requestedStartTime: setTime(tomorrow, 9, 0),
      requestedEndTime: setTime(tomorrow, 17, 0),
      status: "Reserved",
      keyCafeBookingCode: "73910482",
      keyCafeAccessId: "mock-seed-silverado",
    },
    {
      userId: maria.id,
      vehicleId: odyssey.id,
      requestedStartTime: setTime(today, 8, 0),
      requestedEndTime: setTime(today, 18, 0),
      status: "Active",
      keyCafeBookingCode: "48291356",
      keyCafeAccessId: "mock-seed-odyssey",
      keyPickedUpAt: setTime(today, 8, 15),
      tripStartedAt: setTime(today, 8, 20),
      startMileage: 67050,
      preTripInspectionPassed: true,
      pickedUpFood: true,
    },
    {
      userId: jordan.id,
      vehicleId: escape.id,
      requestedStartTime: setTime(inThreeDays, 10, 0),
      requestedEndTime: setTime(inThreeDays, 15, 0),
      status: "Reserved",
      keyCafeBookingCode: "91827364",
      keyCafeAccessId: "mock-seed-escape",
    },
    {
      userId: maria.id,
      vehicleId: transit.id,
      requestedStartTime: setTime(dayOffset(-2), 9, 0),
      requestedEndTime: setTime(dayOffset(-2), 12, 0),
      status: "Completed",
      tripStartedAt: setTime(dayOffset(-2), 9, 5),
      tripEndedAt: setTime(dayOffset(-2), 11, 45),
      startMileage: 28380,
      endMileage: 28450,
      preTripInspectionPassed: true,
      fuelLevelEndPercent: 75,
      droppedOffFood: true,
      washed: true,
    },
    {
      userId: jordan.id,
      vehicleId: camry.id,
      requestedStartTime: setTime(dayOffset(-1), 13, 0),
      requestedEndTime: setTime(dayOffset(-1), 16, 0),
      status: "Cancelled",
    },
    {
      userId: maria.id,
      vehicleId: camry.id,
      requestedStartTime: setTime(dayOffset(2), 10, 0),
      requestedEndTime: setTime(dayOffset(2), 14, 0),
      status: "Pending",
      staffNotes: "Need vehicle for food delivery route.",
    },
  ]);

  console.log("Seed complete.");
  console.log(`Users: ${users.length} (password for all seeded accounts: ${SEED_PASSWORD})`);
  console.log(`Vehicles: ${vehicles.length}`);
  console.log("Reservations: 6");
  console.log("");
  console.log("Availability notes:");
  console.log("- Ford Transit & Toyota Camry: available most weekdays (8am-5pm)");
  console.log("- Chevy Silverado: booked tomorrow 9am-5pm");
  console.log("- Honda Odyssey: in use today 8am-6pm");
  console.log("- Nissan NV200: maintenance (hidden from booking)");
  console.log("- RAM ProMaster: out of service (hidden from booking)");
  console.log("- Ford Escape: booked 3 days from now 10am-3pm only");
  console.log("- Toyota Camry: pending request in 2 days for admin review");

  await sequelize.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

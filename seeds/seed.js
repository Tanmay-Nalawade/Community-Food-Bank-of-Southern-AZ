require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/user");
const Vehicle = require("../models/vehicle");
const Reservation = require("../models/reservation");

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
  if (!process.env.MONGO_DB_URL) {
    throw new Error("MONGO_DB_URL is not set in .env");
  }

  await mongoose.connect(process.env.MONGO_DB_URL);

  await Promise.all([
    Reservation.deleteMany({}),
    Vehicle.deleteMany({}),
    User.deleteMany({}),
  ]);

  const users = await User.insertMany([
    {
      firstName: "Jordan",
      lastName: "Lee",
      email: "jordan.lee@cfb.example",
      role: "Staff",
    },
    {
      firstName: "Maria",
      lastName: "Garcia",
      email: "maria.garcia@cfb.example",
      role: "Staff",
    },
    {
      firstName: "Alex",
      lastName: "Rivera",
      email: "alex.rivera@cfb.example",
      role: "Admin",
    },
  ]);

  const [jordan, maria] = users;

  const vehicles = await Vehicle.insertMany([
    {
      make: "Ford",
      model: "Transit",
      year: 2022,
      licensePlate: "CFB-1001",
      keyCafeKeyId: "KC-TRANSIT-01",
      currentMileage: 28450,
      status: "Available",
    },
    {
      make: "Toyota",
      model: "Camry",
      year: 2021,
      licensePlate: "CFB-1002",
      keyCafeKeyId: "KC-CAMRY-01",
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
      currentMileage: 67100,
      status: "In Use",
    },
    {
      make: "Nissan",
      model: "NV200",
      year: 2018,
      licensePlate: "CFB-1005",
      keyCafeKeyId: "KC-NV200-01",
      currentMileage: 89200,
      status: "Maintenance",
      activeIssues: [
        {
          reportedAt: new Date(),
          description: "Brake inspection pending",
        },
      ],
    },
    {
      make: "RAM",
      model: "ProMaster",
      year: 2023,
      licensePlate: "CFB-1006",
      keyCafeKeyId: "KC-PRO-01",
      currentMileage: 15600,
      status: "Out of Service",
      activeIssues: [
        {
          reportedAt: new Date(),
          description: "Awaiting body shop repair",
        },
      ],
    },
    {
      make: "Ford",
      model: "Escape",
      year: 2022,
      licensePlate: "CFB-1007",
      keyCafeKeyId: "KC-ESC-01",
      currentMileage: 22100,
      status: "Available",
    },
  ]);

  const [transit, camry, silverado, odyssey, , , escape] = vehicles;

  const today = dayOffset(0);
  const tomorrow = dayOffset(1);
  const inThreeDays = dayOffset(3);

  await Reservation.insertMany([
    {
      userId: jordan._id,
      vehicleId: silverado._id,
      requestedStartTime: setTime(tomorrow, 9, 0),
      requestedEndTime: setTime(tomorrow, 17, 0),
      status: "Reserved",
    },
    {
      userId: maria._id,
      vehicleId: odyssey._id,
      requestedStartTime: setTime(today, 8, 0),
      requestedEndTime: setTime(today, 18, 0),
      status: "Active",
      keyCafeAccess: {
        pinCode: "482913",
        accessId: "KC-ACCESS-ODY-01",
        keyPickedUpAt: setTime(today, 8, 15),
      },
      tripLog: {
        tripStartedAt: setTime(today, 8, 20),
        startMileage: 67050,
      },
    },
    {
      userId: jordan._id,
      vehicleId: escape._id,
      requestedStartTime: setTime(inThreeDays, 10, 0),
      requestedEndTime: setTime(inThreeDays, 15, 0),
      status: "Reserved",
    },
    {
      userId: maria._id,
      vehicleId: transit._id,
      requestedStartTime: setTime(dayOffset(-2), 9, 0),
      requestedEndTime: setTime(dayOffset(-2), 12, 0),
      status: "Completed",
      tripLog: {
        tripStartedAt: setTime(dayOffset(-2), 9, 5),
        tripEndedAt: setTime(dayOffset(-2), 11, 45),
        startMileage: 28380,
        endMileage: 28450,
      },
    },
    {
      userId: jordan._id,
      vehicleId: camry._id,
      requestedStartTime: setTime(dayOffset(-1), 13, 0),
      requestedEndTime: setTime(dayOffset(-1), 16, 0),
      status: "Cancelled",
    },
    {
      userId: maria._id,
      vehicleId: camry._id,
      requestedStartTime: setTime(dayOffset(2), 10, 0),
      requestedEndTime: setTime(dayOffset(2), 14, 0),
      status: "Pending",
      staffNotes: "Need vehicle for food delivery route.",
    },
  ]);

  console.log("Seed complete.");
  console.log(`Users: ${users.length}`);
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

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

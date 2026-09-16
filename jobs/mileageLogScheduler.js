const Vehicle = require("../models/vehicle");
const MileageLogSend = require("../models/mileageLogSend");
const { buildMonthlyLog } = require("../services/mileageLog");
const { sendMonthlyMileageLog } = require("../services/email/mileageLogNotifications");

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const TIMEZONE = process.env.MILEAGE_LOG_TIMEZONE || "America/Phoenix";

// Resolves "today" in the given IANA timezone (rather than assuming the
// server's own timezone matches Transportation's), the same approach
// services/keycafe.js's formatDateTime uses for KeyCafe booking windows.
function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

// True if `date`, evaluated in `timeZone`, falls on the last weekday
// (Mon-Fri) of its calendar month.
function isLastBusinessDayOfMonth(date, timeZone) {
  const { year, month, day, weekday } = localDateParts(date, timeZone);

  if (weekday === "Sat" || weekday === "Sun") {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  for (let d = day + 1; d <= daysInMonth; d++) {
    const candidateWeekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (candidateWeekday !== 0 && candidateWeekday !== 6) {
      return false;
    }
  }

  return true;
}

async function runCheck() {
  const now = new Date();

  if (!isLastBusinessDayOfMonth(now, TIMEZONE)) {
    return;
  }

  const { year, month } = localDateParts(now, TIMEZONE);

  let vehicles;
  try {
    vehicles = await Vehicle.find({});
  } catch (error) {
    console.error("Mileage log scheduler failed to load vehicles:", error);
    return;
  }

  for (const vehicle of vehicles) {
    try {
      await MileageLogSend.create({ vehicleId: vehicle._id, year, month });
    } catch (error) {
      if (error.code === 11000) {
        continue;
      }
      console.error(`Failed to record mileage log send for vehicle ${vehicle._id}:`, error);
      continue;
    }

    const log = await buildMonthlyLog(vehicle._id, year, month);
    await sendMonthlyMileageLog(log);
  }
}

function start() {
  runCheck();
  return setInterval(runCheck, CHECK_INTERVAL_MS);
}

module.exports = { start, runCheck, isLastBusinessDayOfMonth };

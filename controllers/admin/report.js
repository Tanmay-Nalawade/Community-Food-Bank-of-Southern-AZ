const { Op, fn, col, literal } = require("sequelize");
const { Vehicle, Reservation, AccessLog, TripLogSend } = require("../../models");
const { fetchPage, PAGE_SIZE } = require("../../utils/pagination");
const { effectiveTripDate, driverFullName, tripDateInRange } = require("../../services/mileageLog");
const { sendTripLog } = require("../../services/email/tripLogNotifications");
const { isConfigured: isEmailConfigured } = require("../../services/email");
const fmt = require("../../utils/formatDate");

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Same "did this trip happen" statuses the per-vehicle mileage log uses
// (services/mileageLog.js) — this fleet-wide table is the same underlying
// trip data, just spanning every vehicle instead of one at a time. The
// per-vehicle mileage log is the "detailed" drill-down (adds Pre-Trip
// Inspection, Fuel %, Washed, etc.) linked from each row here.
const TRIP_LOG_STATUSES = ["Active", "Completed"];

function fetchAccessLogs(skip, limit) {
  return AccessLog.findAll({
    include: [
      { association: "user", attributes: ["id", "firstName", "lastName", "email"] },
      { association: "vehicle", attributes: ["id", "make", "model", "licensePlate"] },
    ],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    offset: skip,
    limit,
  });
}

function fetchTripLog(skip, limit) {
  return Reservation.findAll({
    where: { status: { [Op.in]: TRIP_LOG_STATUSES } },
    include: [
      { association: "user", attributes: ["id", "firstName", "lastName"] },
      { association: "vehicle", attributes: ["id", "make", "model", "year", "licensePlate"] },
    ],
    order: [["requestedStartTime", "DESC"], ["id", "DESC"]],
    offset: skip,
    limit,
  });
}

// "YYYY-MM-DD" for a Date, in the server's local time (the same local-time
// convention parseBookingWindow uses for booking dates).
function isoDay(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// [start, end) Date bounds for an inclusive YYYY-MM-DD from/to pair, or
// null if either isn't a real calendar date (e.g. 2026-02-31).
function dayRange(fromDate, toDate) {
  const start = new Date(`${fromDate}T00:00`);
  const end = new Date(`${toDate}T00:00`);
  if (isoDay(start) !== fromDate || isoDay(end) !== toDate) {
    return null;
  }
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function shapeTripRow(reservation) {
  const start = reservation.startMileage;
  const end = reservation.endMileage;
  const date = effectiveTripDate(reservation);

  return {
    reservationId: reservation.id,
    date,
    vehicle: reservation.vehicle,
    driverName: driverFullName(reservation.user),
    startMileage: start ?? null,
    endMileage: end ?? null,
    distanceTravelled: start != null && end != null ? end - start : null,
    foodRelated: reservation.tripFoodRelated === "Yes",
    manualEntry: reservation.isManualEntry,
    mileageLogUrl: reservation.vehicle
      ? `/admin/vehicles/${reservation.vehicle.id}/mileage-log?year=${date.getFullYear()}&month=${date.getMonth() + 1}`
      : null,
  };
}

// Per-vehicle booking count, total booked hours and most recent booking,
// computed in MySQL (was a Mongo $group aggregation).
async function fetchUtilization() {
  const rows = await Reservation.findAll({
    attributes: [
      "vehicleId",
      [fn("COUNT", col("id")), "bookingCount"],
      [
        literal("SUM(TIMESTAMPDIFF(SECOND, requested_start_time, requested_end_time)) / 3600"),
        "totalHours",
      ],
      [fn("MAX", col("requested_start_time")), "lastBookedAt"],
    ],
    where: { status: { [Op.in]: ["Reserved", "Active", "Completed"] } },
    group: ["vehicleId"],
    raw: true,
  });

  return new Map(
    rows.map((row) => [
      row.vehicleId,
      {
        bookingCount: Number(row.bookingCount),
        totalHours: Number(row.totalHours),
        lastBookedAt: row.lastBookedAt ? new Date(row.lastBookedAt) : null,
      },
    ]),
  );
}

exports.index = async (req, res) => {
  const [vehicles, utilizationByVehicleId] = await Promise.all([
    Vehicle.findAll({ order: [["make", "ASC"], ["model", "ASC"]] }),
    fetchUtilization(),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

  const vehicleReport = vehicles
    .map((vehicle) => {
      const stats = utilizationByVehicleId.get(vehicle.id);
      return {
        vehicle,
        bookingCount: stats?.bookingCount || 0,
        totalHours: stats ? Math.round(stats.totalHours) : 0,
        lastBookedAt: stats?.lastBookedAt || null,
        idle: !stats || stats.lastBookedAt < thirtyDaysAgo,
      };
    })
    .sort((a, b) => b.bookingCount - a.bookingCount);

  const { items: accessLogs, hasMore, nextSkip } = await fetchPage(fetchAccessLogs, 0);

  const {
    items: tripReservations,
    hasMore: tripHasMore,
    nextSkip: tripNextSkip,
  } = await fetchPage(fetchTripLog, 0);
  const tripLog = tripReservations.map(shapeTripRow);

  const tripLogSends = await TripLogSend.findAll({
    include: [{ association: "sentBy", attributes: ["id", "firstName", "lastName"] }],
    order: [["sentAt", "DESC"], ["id", "DESC"]],
    limit: 5,
  });

  // The send form defaults to the current calendar month, and to whoever
  // the trip log was last sent to (usually the same Transportation mailbox).
  const today = new Date();

  res.render("admin/reports/index", {
    title: "Reports",
    vehicleReport,
    tripLog,
    tripHasMore,
    tripNextSkip,
    tripLogSends,
    sendDefaults: {
      recipient: tripLogSends[0]?.recipient || "",
      fromDate: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)),
      toDate: isoDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    },
    accessLogs,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "admin-reports",
  });
};

exports.moreTrips = async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const { items: tripReservations, hasMore } = await fetchPage(fetchTripLog, skip);
  const tripLog = tripReservations.map(shapeTripRow);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/reports/_trip-log-rows", { tripLog });
};

exports.more = async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const { items: accessLogs, hasMore } = await fetchPage(fetchAccessLogs, skip);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/reports/_access-log-rows", { accessLogs });
};

// Emails every trip (Active/Completed booking) whose date falls in the
// chosen range — the same rows and columns as the Trip log table above,
// just not paginated.
exports.sendTripLog = async (req, res) => {
  const { recipient, fromDate, toDate } = req.body;
  const range = dayRange(fromDate, toDate);

  if (!range) {
    req.flash("error", "Please choose valid start and end dates.");
    return res.redirect("/admin/reports");
  }

  const reservations = await Reservation.findAll({
    where: {
      status: { [Op.in]: TRIP_LOG_STATUSES },
      ...tripDateInRange(range.start, range.end),
    },
    include: [
      { association: "user", attributes: ["id", "firstName", "lastName"] },
      { association: "vehicle", attributes: ["id", "make", "model", "year", "licensePlate"] },
    ],
    order: [["requestedStartTime", "DESC"], ["id", "DESC"]],
  });

  const rows = reservations.map(shapeTripRow);
  const rangeLabel =
    fromDate === toDate
      ? fmt.date(range.start)
      : `${fmt.date(range.start)} – ${fmt.date(new Date(`${toDate}T00:00`))}`;
  const currentUser = res.locals.currentUser;

  try {
    await sendTripLog({ rows, rangeLabel, recipient, sentBy: currentUser });
  } catch (error) {
    console.error("Failed to send trip log email:", error);
    req.flash("error", `Could not send the trip log to ${recipient}. Check the email settings and try again.`);
    return res.redirect("/admin/reports");
  }

  await TripLogSend.create({
    recipient,
    fromDate,
    toDate,
    tripCount: rows.length,
    sentById: currentUser.id,
    sentAt: new Date(),
  });

  const summary = `Trip log for ${rangeLabel} (${rows.length} trip${rows.length === 1 ? "" : "s"})`;
  req.flash(
    "success",
    isEmailConfigured()
      ? `${summary} sent to ${recipient}.`
      : `Email isn't configured (SMTP settings missing), so the ${summary.charAt(0).toLowerCase()}${summary.slice(1)} ` +
          `was only logged to the server console, not actually sent to ${recipient}.`,
  );
  res.redirect("/admin/reports");
};

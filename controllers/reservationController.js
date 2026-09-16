const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");
const { parseBookingWindow } = require("../utils/availability");
const {
  grantReservationAccess,
  revokeReservationAccess,
} = require("../services/reservationKeycafe");
const { sendBookingConfirmation } = require("../services/reservationNotifications");
const { fetchPage, PAGE_SIZE } = require("../utils/pagination");

const CANCELABLE_STATUSES = ["Pending", "Reserved"];
const REPORTABLE_STATUSES = ["Active", "Completed"];
const CURRENT_STATUSES = ["Reserved", "Active"];
const UPCOMING_STATUSES = ["Pending", "Reserved", "Active"];

// A driver's current/upcoming bookings are naturally small (bounded by how
// many trips one person can have going on or scheduled at once), so those
// are fetched in full. Past bookings accumulate for as long as someone's
// been on staff, so that bucket is the one that needs pagination.
function buildPastFilter(userId, now) {
  return {
    userId,
    $or: [
      { status: { $in: ["Completed", "Cancelled", "Denied"] } },
      { status: "Pending", requestedStartTime: { $lte: now } },
      { status: { $in: CURRENT_STATUSES }, requestedEndTime: { $lte: now } },
    ],
  };
}

function fetchPastBookings(userId, now) {
  return (skip, limit) =>
    Reservation.find(buildPastFilter(userId, now))
      .populate("vehicleId")
      .sort({ requestedStartTime: -1 })
      .skip(skip)
      .limit(limit);
}

exports.createRequest = async (req, res) => {
  const booking = parseBookingWindow(
    req.body.date,
    req.body.startTime,
    req.body.endTime,
  );

  if (!booking) {
    req.flash("error", "Please choose a valid date and time for your booking.");
    return res.redirect(`/vehicles/${req.params.vehicleId}`);
  }

  const vehicle = await Vehicle.findById(req.params.vehicleId);
  if (!vehicle) {
    req.flash("error", "That vehicle could not be found.");
    return res.redirect("/vehicles");
  }

  const hasConflict = await Reservation.exists({
    vehicleId: vehicle._id,
    status: { $in: ["Pending", "Reserved", "Active"] },
    requestedStartTime: { $lt: booking.end },
    requestedEndTime: { $gt: booking.start },
  });

  const reservation = await Reservation.create({
    userId: res.locals.currentUser._id,
    vehicleId: vehicle._id,
    requestedStartTime: booking.start,
    requestedEndTime: booking.end,
    staffNotes: req.body.staffNotes || "",
    status: hasConflict ? "Pending" : "Reserved",
  });

  if (hasConflict) {
    await sendBookingConfirmation(reservation, res.locals.currentUser, vehicle);
    req.flash(
      "error",
      "That vehicle was just booked for an overlapping time. Your request has been sent to Transportation to sort out.",
    );
    return res.redirect("/reservations/mine");
  }

  try {
    await reservation.populate("userId", "firstName lastName email");
    await reservation.populate("vehicleId", "make model keyCafeKeyId");
    await grantReservationAccess(reservation);
    await reservation.save();
    await Vehicle.findByIdAndUpdate(vehicle._id, { status: "Reserved" });
    await sendBookingConfirmation(reservation, res.locals.currentUser, vehicle);
    req.flash("success", "Vehicle booked! Your KeyCafe pickup code is ready on your dashboard.");
  } catch (error) {
    console.error("KeyCafe access creation failed:", error);
    reservation.status = "Pending";
    reservation.adminNotes = "Auto-confirm failed: KeyCafe access could not be created.";
    await reservation.save();
    await sendBookingConfirmation(reservation, res.locals.currentUser, vehicle);
    req.flash(
      "error",
      "Your booking was saved, but automatic KeyCafe access failed. Transportation will follow up shortly.",
    );
  }

  res.redirect("/reservations/mine");
};

exports.mine = async (req, res) => {
  const userId = res.locals.currentUser._id;
  const now = new Date();

  const [currentBookings, upcomingBookings, pastPage] = await Promise.all([
    Reservation.find({
      userId,
      status: { $in: CURRENT_STATUSES },
      requestedStartTime: { $lte: now },
      requestedEndTime: { $gt: now },
    })
      .populate("vehicleId")
      .sort({ requestedStartTime: 1 }),

    Reservation.find({
      userId,
      status: { $in: UPCOMING_STATUSES },
      requestedStartTime: { $gt: now },
    })
      .populate("vehicleId")
      .sort({ requestedStartTime: 1 }),

    fetchPage(fetchPastBookings(userId, now), 0),
  ]);

  res.render("reservations/mine", {
    title: "My Dashboard",
    currentBookings,
    upcomingBookings,
    pastBookings: pastPage.items,
    pastHasMore: pastPage.hasMore,
    pastNextSkip: pastPage.nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "dashboard",
  });
};

exports.morePast = async (req, res) => {
  const userId = res.locals.currentUser._id;
  const now = new Date();
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: reservations, hasMore } = await fetchPage(
    fetchPastBookings(userId, now),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("partials/_booking-cards", { reservations, muted: true });
};

exports.editForm = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  }).populate("vehicleId");

  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  if (reservation.status !== "Pending") {
    req.flash("error", "Only pending requests can be edited. Contact an admin to change an approved booking.");
    return res.redirect("/reservations/mine");
  }

  res.render("reservations/edit", {
    title: "Edit Booking Request",
    reservation,
    activeNav: "dashboard",
  });
};

exports.updateRequest = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  });

  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  if (reservation.status !== "Pending") {
    req.flash("error", "Only pending requests can be edited.");
    return res.redirect("/reservations/mine");
  }

  const booking = parseBookingWindow(
    req.body.date,
    req.body.startTime,
    req.body.endTime,
  );

  if (!booking) {
    req.flash("error", "Please choose a valid date and time.");
    return res.redirect(`/reservations/${reservation._id}/edit`);
  }

  const conflictExists = await Reservation.exists({
    _id: { $ne: reservation._id },
    vehicleId: reservation.vehicleId,
    status: { $in: ["Pending", "Reserved", "Active"] },
    requestedStartTime: { $lt: booking.end },
    requestedEndTime: { $gt: booking.start },
  });

  if (conflictExists) {
    req.flash("error", "That vehicle is already booked during that window.");
    return res.redirect(`/reservations/${reservation._id}/edit`);
  }

  reservation.requestedStartTime = booking.start;
  reservation.requestedEndTime = booking.end;
  reservation.staffNotes = req.body.staffNotes || "";
  await reservation.save();

  req.flash("success", "Booking request updated.");
  res.redirect("/reservations/mine");
};

exports.cancelRequest = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  });

  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  if (
    !CANCELABLE_STATUSES.includes(reservation.status) ||
    reservation.requestedEndTime <= new Date()
  ) {
    req.flash("error", "This booking can no longer be canceled here. Contact an admin.");
    return res.redirect("/reservations/mine");
  }

  let revokeFailed = false;
  try {
    await revokeReservationAccess(reservation);
  } catch (error) {
    console.error("KeyCafe access cancellation failed:", error);
    revokeFailed = true;
  }

  reservation.status = "Cancelled";
  await reservation.save();

  if (revokeFailed) {
    req.flash(
      "error",
      "Booking canceled, but the KeyCafe access could not be revoked automatically. Contact an admin.",
    );
  } else {
    req.flash("success", "Booking canceled.");
  }

  res.redirect("/reservations/mine");
};

exports.mileageForm = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  }).populate("vehicleId", "make model year licensePlate");

  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Mileage can only be reported for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  res.render("reservations/mileage", {
    title: "Report Mileage",
    reservation,
    activeNav: "dashboard",
  });
};

exports.submitMileage = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  });

  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Mileage can only be reported for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  const { startMileage, endMileage, fuelLevelEndPercent, otherDutyNote } = req.body;

  if (startMileage !== "" && startMileage !== undefined) {
    reservation.tripLog.startMileage = Number(startMileage);
  }
  if (endMileage !== "" && endMileage !== undefined) {
    reservation.tripLog.endMileage = Number(endMileage);
  }
  if (fuelLevelEndPercent !== "" && fuelLevelEndPercent !== undefined) {
    reservation.tripLog.fuelLevelEndPercent = Number(fuelLevelEndPercent);
  }

  reservation.tripLog.preTripInspectionPassed = req.body.preTripInspectionPassed === "on";
  reservation.tripLog.droppedOffFood = req.body.droppedOffFood === "on";
  reservation.tripLog.pickedUpFood = req.body.pickedUpFood === "on";
  reservation.tripLog.otherDuty = req.body.otherDuty === "on";
  reservation.tripLog.otherDutyNote = (otherDutyNote || "").trim();
  reservation.tripLog.washed = req.body.washed === "on";

  await reservation.save();

  req.flash("success", "Mileage reported. Thanks!");
  res.redirect("/reservations/mine");
};

exports.issueForm = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  }).populate("vehicleId", "make model year licensePlate");

  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Issues can only be reported for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  res.render("reservations/issue", {
    title: "Report an Issue",
    reservation,
    activeNav: "dashboard",
  });
};

exports.submitIssue = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  });

  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Issues can only be reported for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  const description = (req.body.description || "").trim();

  if (!description) {
    req.flash("error", "Please describe the issue.");
    return res.redirect(`/reservations/${reservation._id}/issue`);
  }

  await Vehicle.findByIdAndUpdate(reservation.vehicleId, {
    $push: {
      activeIssues: {
        description,
        reportedBy: res.locals.currentUser._id,
        reservationId: reservation._id,
        reviewed: false,
      },
    },
  });

  req.flash("success", "Issue reported to Transportation for review.");
  res.redirect("/reservations/mine");
};

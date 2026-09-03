const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");
const { parseBookingWindow } = require("../utils/availability");
const { revokeReservationAccess } = require("../services/reservationKeycafe");
const { sendBookingConfirmation } = require("../services/reservationNotifications");

const CANCELABLE_STATUSES = ["Pending", "Reserved"];
const REPORTABLE_STATUSES = ["Active", "Completed"];

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

  const reservation = await Reservation.create({
    userId: res.locals.currentUser._id,
    vehicleId: vehicle._id,
    requestedStartTime: booking.start,
    requestedEndTime: booking.end,
    staffNotes: req.body.staffNotes || "",
    status: "Pending",
  });

  await sendBookingConfirmation(reservation, res.locals.currentUser, vehicle);

  req.flash("success", "Booking request submitted. An admin will review it shortly.");
  res.redirect("/reservations/mine");
};

exports.mine = async (req, res) => {
  const now = new Date();
  const reservations = await Reservation.find({
    userId: res.locals.currentUser._id,
  })
    .populate("vehicleId")
    .sort({ requestedStartTime: 1 });

  const currentBookings = reservations.filter(
    (reservation) =>
      ["Reserved", "Active"].includes(reservation.status) &&
      reservation.requestedStartTime <= now &&
      reservation.requestedEndTime > now,
  );

  const upcomingBookings = reservations.filter(
    (reservation) =>
      ["Pending", "Reserved", "Active"].includes(reservation.status) &&
      reservation.requestedStartTime > now,
  );

  const pastBookings = reservations
    .filter(
      (reservation) =>
        !currentBookings.includes(reservation) && !upcomingBookings.includes(reservation),
    )
    .reverse();

  res.render("reservations/mine", {
    title: "My Dashboard",
    currentBookings,
    upcomingBookings,
    pastBookings,
    activeNav: "dashboard",
  });
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

  if (!CANCELABLE_STATUSES.includes(reservation.status)) {
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

  const { startMileage, endMileage } = req.body;

  if (startMileage !== "" && startMileage !== undefined) {
    reservation.tripLog.startMileage = Number(startMileage);
  }
  if (endMileage !== "" && endMileage !== undefined) {
    reservation.tripLog.endMileage = Number(endMileage);
  }

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

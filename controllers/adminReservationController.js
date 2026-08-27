const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");
const { parseBookingWindow, formatBookingLabel } = require("../utils/availability");

exports.listReservations = async (req, res) => {
  const reservations = await Reservation.find({})
    .populate("userId", "firstName lastName email role")
    .populate("vehicleId", "make model year licensePlate")
    .sort({ createdAt: -1 });

  res.render("admin/reservations/index", {
    title: "Manage Reservations",
    reservations,
    activeNav: "admin",
  });
};

exports.editReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id)
    .populate("userId", "firstName lastName email")
    .populate("vehicleId");

  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  const vehicles = await Vehicle.find({}).sort({ make: 1, model: 1 });

  res.render("admin/reservations/edit", {
    title: "Edit Reservation",
    reservation,
    vehicles,
    activeNav: "admin",
  });
};

exports.updateReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  const booking = parseBookingWindow(
    req.body.date,
    req.body.startTime,
    req.body.endTime,
  );

  if (!booking) {
    return res.status(400).send("Invalid booking time.");
  }

  reservation.vehicleId = req.body.vehicleId;
  reservation.requestedStartTime = booking.start;
  reservation.requestedEndTime = booking.end;
  reservation.status = req.body.status;
  reservation.adminNotes = req.body.adminNotes || "";
  reservation.reviewedBy = res.locals.currentUser._id;
  reservation.reviewedAt = new Date();

  await reservation.save();
  res.redirect("/admin/reservations");
};

exports.approveReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  reservation.status = "Reserved";
  reservation.reviewedBy = res.locals.currentUser._id;
  reservation.reviewedAt = new Date();
  await reservation.save();

  await Vehicle.findByIdAndUpdate(reservation.vehicleId, {
    status: "Reserved",
  });

  res.redirect("/admin/reservations");
};

exports.denyReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  reservation.status = "Denied";
  reservation.adminNotes = req.body.adminNotes || reservation.adminNotes;
  reservation.reviewedBy = res.locals.currentUser._id;
  reservation.reviewedAt = new Date();
  await reservation.save();

  res.redirect("/admin/reservations");
};

exports.deleteReservation = async (req, res) => {
  await Reservation.findByIdAndDelete(req.params.id);
  res.redirect("/admin/reservations");
};

const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");
const { parseBookingWindow, formatBookingLabel } = require("../utils/availability");
const {
  grantReservationAccess,
  revokeReservationAccess,
} = require("../services/reservationKeycafe");

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
  const reservation = await Reservation.findById(req.params.id)
    .populate("userId", "firstName lastName email")
    .populate("vehicleId", "make model keyCafeKeyId");

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

  const previousStatus = reservation.status;
  const nextStatus = req.body.status;

  reservation.vehicleId = req.body.vehicleId;
  reservation.requestedStartTime = booking.start;
  reservation.requestedEndTime = booking.end;
  reservation.status = nextStatus;
  reservation.adminNotes = req.body.adminNotes || "";
  reservation.reviewedBy = res.locals.currentUser._id;
  reservation.reviewedAt = new Date();

  try {
    if (nextStatus === "Reserved" && previousStatus !== "Reserved") {
      await grantReservationAccess(reservation);
    } else if (
      ["Denied", "Cancelled"].includes(nextStatus) &&
      reservation.keyCafeAccess?.accessId
    ) {
      await revokeReservationAccess(reservation);
    }
  } catch (error) {
    console.error("KeyCafe access sync failed:", error);
    req.flash(
      "error",
      "Could not update KeyCafe access for this reservation. No changes were saved.",
    );
    return res.redirect(`/admin/reservations/${reservation._id}/edit`);
  }

  await reservation.save();

  if (["Denied", "Cancelled"].includes(nextStatus)) {
    req.flash("success", "Booking canceled.");
  } else {
    req.flash("success", "Reservation updated.");
  }

  res.redirect("/admin/reservations");
};

exports.approveReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id)
    .populate("userId", "firstName lastName email")
    .populate("vehicleId", "make model keyCafeKeyId");

  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  try {
    await grantReservationAccess(reservation);
    reservation.status = "Reserved";
    reservation.reviewedBy = res.locals.currentUser._id;
    reservation.reviewedAt = new Date();
    await reservation.save();

    await Vehicle.findByIdAndUpdate(reservation.vehicleId._id, {
      status: "Reserved",
    });

    req.flash("success", "Reservation approved and KeyCafe access granted.");
  } catch (error) {
    console.error("KeyCafe access creation failed:", error);
    req.flash(
      "error",
      "Could not create KeyCafe access for this reservation. Check your KeyCafe settings and try again.",
    );
  }

  res.redirect("/admin/reservations");
};

exports.denyReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) {
    return res.status(404).send("Reservation not found.");
  }

  let revokeFailed = false;
  try {
    await revokeReservationAccess(reservation);
  } catch (error) {
    console.error("KeyCafe access cancellation failed:", error);
    revokeFailed = true;
  }

  reservation.status = "Denied";
  reservation.adminNotes = req.body.adminNotes || reservation.adminNotes;
  reservation.reviewedBy = res.locals.currentUser._id;
  reservation.reviewedAt = new Date();
  await reservation.save();

  if (revokeFailed) {
    req.flash(
      "error",
      "Booking canceled, but the KeyCafe access could not be revoked automatically. Cancel it manually in KeyCafe.",
    );
  } else {
    req.flash("success", "Booking canceled.");
  }

  res.redirect("/admin/reservations");
};

exports.deleteReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);

  let revokeFailed = false;
  if (reservation) {
    try {
      await revokeReservationAccess(reservation);
      await reservation.save();
    } catch (error) {
      console.error("KeyCafe access cancellation failed:", error);
      revokeFailed = true;
    }
  }

  await Reservation.findByIdAndDelete(req.params.id);

  if (revokeFailed) {
    req.flash(
      "error",
      "Booking canceled and removed, but the KeyCafe access could not be revoked automatically. Cancel it manually in KeyCafe.",
    );
  } else {
    req.flash("success", "Booking canceled and removed.");
  }

  res.redirect("/admin/reservations");
};

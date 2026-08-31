const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");
const { parseBookingWindow } = require("../utils/availability");
const { grantReservationAccess } = require("../services/reservationKeycafe");

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
    req.flash("success", "Vehicle booked! Your KeyCafe pickup code is ready on your dashboard.");
  } catch (error) {
    console.error("KeyCafe access creation failed:", error);
    reservation.status = "Pending";
    reservation.adminNotes = "Auto-confirm failed: KeyCafe access could not be created.";
    await reservation.save();
    req.flash(
      "error",
      "Your booking was saved, but automatic KeyCafe access failed. Transportation will follow up shortly.",
    );
  }

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

  res.render("reservations/mine", {
    title: "My Dashboard",
    currentBookings,
    upcomingBookings,
    activeNav: "dashboard",
  });
};

const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");
const { parseBookingWindow } = require("../utils/availability");

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

  await Reservation.create({
    userId: res.locals.currentUser._id,
    vehicleId: vehicle._id,
    requestedStartTime: booking.start,
    requestedEndTime: booking.end,
    staffNotes: req.body.staffNotes || "",
    status: "Pending",
  });

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

  res.render("reservations/mine", {
    title: "My Dashboard",
    currentBookings,
    upcomingBookings,
    activeNav: "dashboard",
  });
};

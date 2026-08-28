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
    return res.status(400).send("Invalid booking time.");
  }

  const vehicle = await Vehicle.findById(req.params.vehicleId);
  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  await Reservation.create({
    userId: res.locals.currentUser._id,
    vehicleId: vehicle._id,
    requestedStartTime: booking.start,
    requestedEndTime: booking.end,
    staffNotes: req.body.staffNotes || "",
    status: "Pending",
  });

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

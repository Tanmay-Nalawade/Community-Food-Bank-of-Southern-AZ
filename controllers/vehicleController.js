const Vehicle = require("../models/vehicle");
const {
  FLEET_UNAVAILABLE,
  parseBookingWindow,
  getBookedVehicleIds,
  formatBookingLabel,
  toQueryString,
} = require("../utils/availability");

exports.index = async (req, res) => {
  const booking = parseBookingWindow(
    req.query.date,
    req.query.startTime,
    req.query.endTime,
  );

  if (!booking) {
    req.flash("error", "Please select a valid date and time to see available vehicles.");
    return res.redirect("/");
  }

  const bookedVehicleIds = await getBookedVehicleIds(booking.start, booking.end);

  const vehicles = await Vehicle.find({
    status: { $nin: FLEET_UNAVAILABLE },
    _id: { $nin: bookedVehicleIds },
  }).sort({ make: 1, model: 1 });

  res.render("vehicles/index", {
    title: "Available Vehicles",
    vehicles,
    booking,
    bookingLabel: formatBookingLabel(booking),
    queryString: toQueryString(booking),
  });
};

exports.viewVehicle = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found");
  }

  const booking = parseBookingWindow(
    req.query.date,
    req.query.startTime,
    req.query.endTime,
  );

  res.render("vehicles/view", {
    title: `${vehicle.make} ${vehicle.model}`,
    vehicle,
    booking,
    bookingLabel: booking ? formatBookingLabel(booking) : null,
    queryString: booking ? toQueryString(booking) : "",
  });
};

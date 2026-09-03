const Vehicle = require("../models/vehicle");
const {
  FLEET_UNAVAILABLE,
  parseBookingWindow,
  getBookedVehicleIds,
  formatBookingLabel,
  toQueryString,
} = require("../utils/availability");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

  const q = (req.query.q || "").trim();
  const bookedVehicleIds = await getBookedVehicleIds(booking.start, booking.end);

  const filter = {
    status: { $nin: FLEET_UNAVAILABLE },
    _id: { $nin: bookedVehicleIds },
  };

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ make: regex }, { model: regex }, { licensePlate: regex }];
  }

  const vehicles = await Vehicle.find(filter).sort({ make: 1, model: 1 });

  const baseQueryString = toQueryString(booking);
  const queryString = q ? `${baseQueryString}&q=${encodeURIComponent(q)}` : baseQueryString;

  res.render("vehicles/index", {
    title: "Available Vehicles",
    vehicles,
    booking,
    bookingLabel: formatBookingLabel(booking),
    queryString,
    baseQueryString,
    q,
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

  const q = req.query.q || "";
  const baseQueryString = booking ? toQueryString(booking) : "";
  const queryString = q ? `${baseQueryString}&q=${encodeURIComponent(q)}` : baseQueryString;

  res.render("vehicles/view", {
    title: `${vehicle.make} ${vehicle.model}`,
    vehicle,
    booking,
    bookingLabel: booking ? formatBookingLabel(booking) : null,
    queryString,
  });
};

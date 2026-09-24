const Vehicle = require("../models/vehicle");
const { renderError } = require("../utils/httpError");
const {
  FLEET_UNAVAILABLE,
  parseBookingWindow,
  getBookedVehicleIds,
  formatBookingLabel,
  toQueryString,
  findTightPrecedingBooking,
  formatTimeLabel,
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

exports.all = async (req, res) => {
  const q = (req.query.q || "").trim();
  const filter = {};

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ make: regex }, { model: regex }, { licensePlate: regex }];
  }

  const vehicles = await Vehicle.find(filter).sort({ make: 1, model: 1 });

  res.render("vehicles/all", {
    title: "All Vehicles",
    vehicles,
    q,
  });
};

exports.viewVehicle = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  const booking = parseBookingWindow(
    req.query.date,
    req.query.startTime,
    req.query.endTime,
  );

  const q = req.query.q || "";
  let backHref;
  let backLabel;

  if (req.query.from === "all") {
    backHref = q ? `/vehicles/all?q=${encodeURIComponent(q)}` : "/vehicles/all";
    backLabel = "Back to all vehicles";
  } else {
    const baseQueryString = booking ? toQueryString(booking) : "";
    const queryString = q ? `${baseQueryString}&q=${encodeURIComponent(q)}` : baseQueryString;
    backHref = queryString ? `/vehicles?${queryString}` : "/vehicles";
    backLabel = "Back to available vehicles";
  }

  const today = new Date();
  const minDate = today.toISOString().split("T")[0];

  // "confirm=gap" only ever arrives via createRequest's redirect after it
  // found a tight same-day turnaround and the driver hadn't confirmed yet —
  // a plain visit to this page (even with a booking window in the query
  // string) never shows this dialog. Re-checking here (rather than trusting
  // a query-string claim) also means a stale/hand-edited URL can't fake a
  // warning that no longer applies.
  let gapWarning = null;
  const formValues = { staffNotes: "", tripFoodRelated: "", tripFoodRelatedDetail: "" };

  if (booking && req.query.confirm === "gap") {
    formValues.staffNotes = req.query.staffNotes || "";
    formValues.tripFoodRelated = req.query.tripFoodRelated || "";
    formValues.tripFoodRelatedDetail = req.query.tripFoodRelatedDetail || "";

    const tightPrevious = await findTightPrecedingBooking(vehicle._id, booking);
    if (tightPrevious) {
      gapWarning = { previousEndLabel: formatTimeLabel(tightPrevious.requestedEndTime) };
    }
  }

  res.render("vehicles/view", {
    title: `${vehicle.make} ${vehicle.model}`,
    vehicle,
    booking,
    bookingLabel: booking ? formatBookingLabel(booking) : null,
    backHref,
    backLabel,
    minDate,
    gapWarning,
    formValues,
  });
};

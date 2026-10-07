const { Op } = require("sequelize");
const { Vehicle } = require("../models");
const { renderError } = require("../utils/httpError");
const { queryString, containsAny } = require("../utils/query");
const {
  FLEET_UNAVAILABLE,
  parseBookingWindow,
  getBookedVehicleIds,
  formatBookingLabel,
  toQueryString,
  findTightPrecedingBooking,
  formatTimeLabel,
} = require("../utils/availability");

const SEARCH_FIELDS = ["make", "model", "licensePlate"];
const BY_NAME = [["make", "ASC"], ["model", "ASC"]];

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

  const q = queryString(req.query.q);
  const bookedVehicleIds = await getBookedVehicleIds(booking.start, booking.end);

  const where = { status: { [Op.notIn]: FLEET_UNAVAILABLE } };

  // Guarded: Sequelize renders an empty NOT IN as `NOT IN (NULL)`, which
  // matches nothing — that would hide the whole fleet when nothing's booked.
  if (bookedVehicleIds.length) {
    where.id = { [Op.notIn]: bookedVehicleIds };
  }

  if (q) {
    Object.assign(where, containsAny(SEARCH_FIELDS, q));
  }

  const vehicles = await Vehicle.findAll({ where, order: BY_NAME });

  const baseQueryString = toQueryString(booking);
  const queryStringWithSearch = q ? `${baseQueryString}&q=${encodeURIComponent(q)}` : baseQueryString;

  res.render("vehicles/index", {
    title: "Available Vehicles",
    vehicles,
    booking,
    bookingLabel: formatBookingLabel(booking),
    queryString: queryStringWithSearch,
    baseQueryString,
    q,
  });
};

exports.all = async (req, res) => {
  const q = queryString(req.query.q);
  const where = q ? containsAny(SEARCH_FIELDS, q) : {};

  const vehicles = await Vehicle.findAll({ where, order: BY_NAME });

  res.render("vehicles/all", {
    title: "All Vehicles",
    vehicles,
    q,
  });
};

exports.viewVehicle = async (req, res) => {
  const vehicle = await Vehicle.findByPk(req.params.id, {
    include: ["activeIssues"],
    order: [["activeIssues", "id", "ASC"]],
  });

  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  const booking = parseBookingWindow(
    req.query.date,
    req.query.startTime,
    req.query.endTime,
  );

  const q = queryString(req.query.q);
  let backHref;
  let backLabel;

  if (req.query.from === "all") {
    backHref = q ? `/vehicles/all?q=${encodeURIComponent(q)}` : "/vehicles/all";
    backLabel = "Back to all vehicles";
  } else {
    const baseQueryString = booking ? toQueryString(booking) : "";
    const qs = q ? `${baseQueryString}&q=${encodeURIComponent(q)}` : baseQueryString;
    backHref = qs ? `/vehicles?${qs}` : "/vehicles";
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

    const tightPrevious = await findTightPrecedingBooking(vehicle.id, booking);
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

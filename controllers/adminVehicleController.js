const Vehicle = require("../models/vehicle");
const Reservation = require("../models/reservation");
const { fetchPage, PAGE_SIZE } = require("../utils/pagination");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildVehicleFilter(query) {
  const q = (query.q || "").trim();
  const status = query.status || "";
  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { make: regex },
      { model: regex },
      { licensePlate: regex },
      { keyCafeKeyId: regex },
    ];
  }

  return filter;
}

function filterQueryString(query) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

exports.index = async (req, res) => {
  const q = (req.query.q || "").trim();
  const status = req.query.status || "";
  const filter = buildVehicleFilter(req.query);

  const { items: vehicles, hasMore, nextSkip } = await fetchPage(
    (skip, limit) => Vehicle.find(filter).sort({ make: 1, model: 1 }).skip(skip).limit(limit),
    0,
  );

  res.render("admin/vehicles/index", {
    title: "Manage Vehicles",
    vehicles,
    q,
    status,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    moreUrl: `/admin/vehicles/more${filterQueryString(req.query)}`,
    activeNav: "admin-vehicles",
  });
};

exports.more = async (req, res) => {
  const filter = buildVehicleFilter(req.query);
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: vehicles, hasMore } = await fetchPage(
    (s, limit) => Vehicle.find(filter).sort({ make: 1, model: 1 }).skip(s).limit(limit),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/vehicles/_rows", { vehicles });
};

exports.show = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  const fetchReservations = (skip, limit) =>
    Reservation.find({ vehicleId: vehicle._id })
      .populate("userId", "firstName lastName email")
      .sort({ requestedStartTime: -1 })
      .skip(skip)
      .limit(limit);

  const { items: reservations, hasMore, nextSkip } = await fetchPage(fetchReservations, 0);

  res.render("admin/vehicles/show", {
    title: `${vehicle.make} ${vehicle.model}`,
    vehicle,
    reservations,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "admin-vehicles",
  });
};

exports.moreReservations = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  const skip = Math.max(0, Number(req.query.skip) || 0);

  const fetchReservations = (s, limit) =>
    Reservation.find({ vehicleId: vehicle._id })
      .populate("userId", "firstName lastName email")
      .sort({ requestedStartTime: -1 })
      .skip(s)
      .limit(limit);

  const { items: reservations, hasMore } = await fetchPage(fetchReservations, skip);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/vehicles/_reservation-rows", { reservations });
};

exports.update = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  const {
    make,
    model,
    year,
    licensePlate,
    keyCafeKeyId,
    currentMileage,
    status,
    nextMaintenanceDueMileage,
    nextMaintenanceDueDate,
  } = req.body;

  vehicle.make = make;
  vehicle.model = model;
  vehicle.year = year ? Number(year) : undefined;
  vehicle.licensePlate = licensePlate;
  vehicle.keyCafeKeyId = keyCafeKeyId;
  vehicle.currentMileage = Number(currentMileage) || 0;
  vehicle.status = status;
  vehicle.nextMaintenanceDueMileage = nextMaintenanceDueMileage
    ? Number(nextMaintenanceDueMileage)
    : undefined;
  vehicle.nextMaintenanceDueDate = nextMaintenanceDueDate
    ? new Date(nextMaintenanceDueDate)
    : undefined;

  await vehicle.save();

  req.flash("success", "Vehicle updated.");
  res.redirect(`/admin/vehicles/${vehicle._id}`);
};

exports.addIssue = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  const description = (req.body.description || "").trim();

  if (!description) {
    req.flash("error", "Issue description is required.");
    return res.redirect(`/admin/vehicles/${vehicle._id}`);
  }

  vehicle.activeIssues.push({ description, reportedAt: new Date() });
  await vehicle.save();

  req.flash("success", "Issue reported.");
  res.redirect(`/admin/vehicles/${vehicle._id}`);
};

exports.resolveIssue = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  const issue = vehicle.activeIssues.id(req.params.issueId);
  if (issue) {
    issue.deleteOne();
    await vehicle.save();
  }

  req.flash("success", "Issue resolved.");
  res.redirect(`/admin/vehicles/${vehicle._id}`);
};

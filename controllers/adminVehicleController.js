const Vehicle = require("../models/vehicle");
const Reservation = require("../models/reservation");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

exports.index = async (req, res) => {
  const q = (req.query.q || "").trim();
  const status = req.query.status || "";
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

  const vehicles = await Vehicle.find(filter).sort({ make: 1, model: 1 });

  res.render("admin/vehicles/index", {
    title: "Manage Vehicles",
    vehicles,
    q,
    status,
    activeNav: "admin",
  });
};

exports.show = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  const reservations = await Reservation.find({ vehicleId: vehicle._id })
    .populate("userId", "firstName lastName email")
    .sort({ requestedStartTime: -1 })
    .limit(50);

  res.render("admin/vehicles/show", {
    title: `${vehicle.make} ${vehicle.model}`,
    vehicle,
    reservations,
    activeNav: "admin",
  });
};

exports.update = async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);

  if (!vehicle) {
    return res.status(404).send("Vehicle not found.");
  }

  const { make, model, year, licensePlate, keyCafeKeyId, currentMileage, status } = req.body;

  vehicle.make = make;
  vehicle.model = model;
  vehicle.year = year ? Number(year) : undefined;
  vehicle.licensePlate = licensePlate;
  vehicle.keyCafeKeyId = keyCafeKeyId;
  vehicle.currentMileage = Number(currentMileage) || 0;
  vehicle.status = status;

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

const { UniqueConstraintError } = require("sequelize");
const { Vehicle, VehicleIssue, Reservation } = require("../../models");
const { renderError } = require("../../utils/httpError");
const { fetchPage, PAGE_SIZE } = require("../../utils/pagination");
const { queryString, containsAny } = require("../../utils/query");
const {
  isRealKeyCafeId,
  ensureVehicleKey,
  syncVehicleKeyName,
} = require("../../services/keycafe/vehicleKeySync");

const BY_NAME = [["make", "ASC"], ["model", "ASC"]];

function buildVehicleFilter(query) {
  const q = queryString(query.q);
  const status = queryString(query.status);
  const where = {};

  if (status) {
    where.status = status;
  }

  if (q) {
    Object.assign(where, containsAny(["make", "model", "licensePlate", "keyCafeKeyId"], q));
  }

  return where;
}

function filterQueryString(query) {
  const params = new URLSearchParams();
  const q = queryString(query.q);
  const status = queryString(query.status);
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function fetchVehicleReservations(vehicleId) {
  return (skip, limit) =>
    Reservation.findAll({
      where: { vehicleId },
      include: [{ association: "user", attributes: ["id", "firstName", "lastName", "email"] }],
      order: [["requestedStartTime", "DESC"], ["id", "DESC"]],
      offset: skip,
      limit,
    });
}

// Was its own "adminController.js" at the controllers/ root — merged in here
// since it only ever handled adding a vehicle to the fleet.
exports.getAddVehicle = (req, res) => {
  res.render("vehicles/add", {
    title: "Add Vehicle",
  });
};

exports.postAddVehicle = async (req, res) => {
  const { make, model, year, licensePlate, photoUrl, currentMileage } = req.body;

  // Check for a duplicate plate BEFORE calling ensureVehicleKey — that call
  // can create a real, permanent KeyCafe key (no retire/delete feature
  // exists in this app), so failing fast here avoids leaving an orphaned
  // real key behind every time this save would fail on the unique index
  // anyway. Normalized the same way the model does (uppercase/trim).
  const normalizedPlate = (licensePlate || "").trim().toUpperCase();
  const duplicate = await Vehicle.findOne({ where: { licensePlate: normalizedPlate } });
  if (duplicate) {
    req.flash("error", "A vehicle with that license plate already exists.");
    return res.redirect("/admin/vehicles/add");
  }

  const newVehicle = Vehicle.build({
    make,
    model,
    year: year ? Number(year) : null,
    licensePlate,
    photoUrl: (photoUrl || "").trim(),
    currentMileage: Number(currentMileage),
  });

  try {
    newVehicle.keyCafeKeyId = await ensureVehicleKey(newVehicle);
  } catch (error) {
    console.error("Failed to create KeyCafe key for new vehicle:", error);
    req.flash(
      "error",
      "Vehicle was not added: could not create its KeyCafe key. Check API Status and try again.",
    );
    return res.redirect("/admin/vehicles/add");
  }

  // KeyCafe not configured (dev/mock mode) — a placeholder keeps the
  // required column satisfied, the same spirit as this app's other
  // mock fallbacks (e.g. mock KeyCafe booking codes) when unconfigured.
  if (!newVehicle.keyCafeKeyId) {
    newVehicle.keyCafeKeyId = `PENDING-${Date.now()}`;
  }

  try {
    await newVehicle.save();
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      req.flash("error", "A vehicle with that license plate already exists.");
      return res.redirect("/admin/vehicles/add");
    }
    throw error;
  }

  req.flash("success", `${newVehicle.make} ${newVehicle.model} added to the fleet.`);
  res.redirect(`/admin/vehicles/${newVehicle.id}`);
};

exports.index = async (req, res) => {
  const where = buildVehicleFilter(req.query);

  const { items: vehicles, hasMore, nextSkip } = await fetchPage(
    (skip, limit) => Vehicle.findAll({ where, order: BY_NAME, offset: skip, limit }),
    0,
  );

  res.render("admin/vehicles/index", {
    title: "Manage Vehicles",
    vehicles,
    q: queryString(req.query.q),
    status: queryString(req.query.status),
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    moreUrl: `/admin/vehicles/more${filterQueryString(req.query)}`,
    activeNav: "admin-vehicles",
  });
};

exports.more = async (req, res) => {
  const where = buildVehicleFilter(req.query);
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: vehicles, hasMore } = await fetchPage(
    (s, limit) => Vehicle.findAll({ where, order: BY_NAME, offset: s, limit }),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/vehicles/_rows", { vehicles });
};

exports.show = async (req, res) => {
  const vehicle = await Vehicle.findByPk(req.params.id, {
    include: ["activeIssues"],
    order: [["activeIssues", "id", "ASC"]],
  });

  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  const { items: reservations, hasMore, nextSkip } = await fetchPage(
    fetchVehicleReservations(vehicle.id),
    0,
  );

  res.render("admin/vehicles/show", {
    title: `${vehicle.make} ${vehicle.model}`,
    vehicle,
    reservations,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    hasRealKeyCafeKey: isRealKeyCafeId(vehicle.keyCafeKeyId),
    activeNav: "admin-vehicles",
  });
};

exports.moreReservations = async (req, res) => {
  const vehicle = await Vehicle.findByPk(req.params.id);

  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: reservations, hasMore } = await fetchPage(
    fetchVehicleReservations(vehicle.id),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/vehicles/_reservation-rows", { reservations });
};

exports.update = async (req, res) => {
  const vehicle = await Vehicle.findByPk(req.params.id);

  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  const {
    make,
    model,
    year,
    licensePlate,
    currentMileage,
    status,
    nextMaintenanceDueMileage,
    nextMaintenanceDueDate,
  } = req.body;

  vehicle.make = make;
  vehicle.model = model;
  vehicle.year = year ? Number(year) : null;
  vehicle.licensePlate = licensePlate;
  vehicle.currentMileage = Number(currentMileage) || 0;
  vehicle.status = status;
  vehicle.nextMaintenanceDueMileage = nextMaintenanceDueMileage
    ? Number(nextMaintenanceDueMileage)
    : null;
  vehicle.nextMaintenanceDueDate = nextMaintenanceDueDate
    ? new Date(nextMaintenanceDueDate)
    : null;

  try {
    await vehicle.save();
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      req.flash("error", "Another vehicle already uses that license plate.");
      return res.redirect(`/admin/vehicles/${vehicle.id}`);
    }
    throw error;
  }
  await syncVehicleKeyName(vehicle);

  req.flash("success", "Vehicle updated.");
  res.redirect(`/admin/vehicles/${vehicle.id}`);
};

exports.createKeyCafeKey = async (req, res) => {
  const vehicle = await Vehicle.findByPk(req.params.id);

  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  if (isRealKeyCafeId(vehicle.keyCafeKeyId)) {
    req.flash("error", "This vehicle already has a real KeyCafe key.");
    return res.redirect(`/admin/vehicles/${vehicle.id}`);
  }

  try {
    const keyId = await ensureVehicleKey(vehicle);
    if (!keyId) {
      req.flash("error", "KeyCafe isn't configured — set KEYCAFE_EMAIL/KEYCAFE_TOKEN first.");
      return res.redirect(`/admin/vehicles/${vehicle.id}`);
    }
    vehicle.keyCafeKeyId = keyId;
    await vehicle.save();
    req.flash("success", "KeyCafe key created and linked to this vehicle.");
  } catch (error) {
    console.error("Failed to create KeyCafe key:", error);
    req.flash("error", "Could not create a KeyCafe key. Check API Status and try again.");
  }

  res.redirect(`/admin/vehicles/${vehicle.id}`);
};

exports.resetKeyCafeKey = async (req, res) => {
  const vehicle = await Vehicle.findByPk(req.params.id);

  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  if (!isRealKeyCafeId(vehicle.keyCafeKeyId)) {
    req.flash("error", "This vehicle doesn't have a real KeyCafe key to reset.");
    return res.redirect(`/admin/vehicles/${vehicle.id}`);
  }

  // Does not affect any reservation's keyCafe* access already granted under
  // the old key id — those are independent of Vehicle.keyCafeKeyId.
  vehicle.keyCafeKeyId = `PENDING-${Date.now()}`;
  vehicle.keyCafeAccessValid = null;
  vehicle.keyCafeAccessCheckedAt = null;
  await vehicle.save();

  req.flash(
    "success",
    "KeyCafe key cleared. Use \"Create KeyCafe Key\" to link a new one. " +
      "The old key still exists in KeyCafe — remove it there manually if it's no longer valid.",
  );
  res.redirect(`/admin/vehicles/${vehicle.id}`);
};

exports.addIssue = async (req, res) => {
  const vehicle = await Vehicle.findByPk(req.params.id);

  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  const description = (req.body.description || "").trim();

  if (!description) {
    req.flash("error", "Issue description is required.");
    return res.redirect(`/admin/vehicles/${vehicle.id}`);
  }

  await VehicleIssue.create({ vehicleId: vehicle.id, description, reportedAt: new Date() });

  req.flash("success", "Issue reported.");
  res.redirect(`/admin/vehicles/${vehicle.id}`);
};

exports.resolveIssue = async (req, res) => {
  const vehicle = await Vehicle.findByPk(req.params.id);

  if (!vehicle) {
    return renderError(res, 404, "Vehicle not found.");
  }

  await VehicleIssue.destroy({ where: { id: req.params.issueId, vehicleId: vehicle.id } });

  req.flash("success", "Issue resolved.");
  res.redirect(`/admin/vehicles/${vehicle.id}`);
};

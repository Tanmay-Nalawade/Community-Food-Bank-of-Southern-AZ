const Reservation = require("../../models/reservation");
const Vehicle = require("../../models/vehicle");
const User = require("../../models/user");
const { renderError } = require("../../utils/httpError");
const { parseBookingWindow, formatBookingLabel } = require("../../utils/availability");
const {
  grantReservationAccess,
  revokeReservationAccess,
} = require("../../services/keycafe/reservationAccess");
const { fetchPage, PAGE_SIZE } = require("../../utils/pagination");

const HOLDING_STATUSES = ["Reserved", "Active"];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildReservationFilter(query) {
  const { status, vehicleId, driver, startDate, endDate } = query;
  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (vehicleId) {
    filter.vehicleId = vehicleId;
  }

  if (driver) {
    const regex = new RegExp(escapeRegex(driver.trim()), "i");
    const matchingUserIds = await User.find({
      $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
    }).distinct("_id");
    filter.userId = { $in: matchingUserIds };
  }

  if (startDate || endDate) {
    filter.requestedStartTime = {};
    if (startDate) {
      filter.requestedStartTime.$gte = new Date(`${startDate}T00:00`);
    }
    if (endDate) {
      filter.requestedStartTime.$lte = new Date(`${endDate}T23:59:59`);
    }
  }

  return filter;
}

function filterQueryString(query) {
  const params = new URLSearchParams();
  ["status", "vehicleId", "driver", "startDate", "endDate"].forEach((key) => {
    if (query[key]) {
      params.set(key, query[key]);
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function fetchReservations(filter, skip, limit) {
  return Reservation.find(filter)
    .populate("userId", "firstName lastName email role")
    .populate("vehicleId", "make model year licensePlate")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
}

exports.listReservations = async (req, res) => {
  const { status, vehicleId, driver, startDate, endDate } = req.query;
  const filter = await buildReservationFilter(req.query);

  const [{ items: reservations, hasMore, nextSkip }, vehicles] = await Promise.all([
    fetchPage((skip, limit) => fetchReservations(filter, skip, limit), 0),
    Vehicle.find({}).sort({ make: 1, model: 1 }),
  ]);

  res.render("admin/reservations/index", {
    title: "Manage Reservations",
    reservations,
    vehicles,
    filters: {
      status: status || "",
      vehicleId: vehicleId || "",
      driver: driver || "",
      startDate: startDate || "",
      endDate: endDate || "",
    },
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    moreUrl: `/admin/reservations/more${filterQueryString(req.query)}`,
    activeNav: "admin-reservations",
  });
};

exports.moreReservations = async (req, res) => {
  const filter = await buildReservationFilter(req.query);
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: reservations, hasMore } = await fetchPage(
    (s, limit) => fetchReservations(filter, s, limit),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/reservations/_rows", { reservations });
};

exports.pastReservations = async (req, res) => {
  const now = new Date();

  const fetchHistory = (skip, limit) =>
    Reservation.find({ requestedEndTime: { $lt: now } })
      .populate("userId", "firstName lastName email role")
      .populate("vehicleId", "make model year licensePlate")
      .sort({ requestedEndTime: -1 })
      .skip(skip)
      .limit(limit);

  const { items: reservations, hasMore, nextSkip } = await fetchPage(fetchHistory, 0);

  res.render("admin/reservations/history", {
    title: "Booking History",
    reservations,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "admin-reservations",
  });
};

exports.moreHistory = async (req, res) => {
  const now = new Date();
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const fetchHistory = (s, limit) =>
    Reservation.find({ requestedEndTime: { $lt: now } })
      .populate("userId", "firstName lastName email role")
      .populate("vehicleId", "make model year licensePlate")
      .sort({ requestedEndTime: -1 })
      .skip(s)
      .limit(limit);

  const { items: reservations, hasMore } = await fetchPage(fetchHistory, skip);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/reservations/_history-rows", { reservations });
};

exports.showReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id)
    .populate("userId", "firstName lastName email role")
    .populate("vehicleId")
    .populate("reviewedBy", "firstName lastName");

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  res.render("admin/reservations/show", {
    title: "Booking Details",
    reservation,
    activeNav: "admin-reservations",
  });
};

exports.editReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id)
    .populate("userId", "firstName lastName email")
    .populate("vehicleId");

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  const vehicles = await Vehicle.find({}).sort({ make: 1, model: 1 });

  res.render("admin/reservations/edit", {
    title: "Edit Reservation",
    reservation,
    vehicles,
    activeNav: "admin-reservations",
  });
};

exports.updateReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id)
    .populate("userId", "firstName lastName email")
    .populate("vehicleId", "make model keyCafeKeyId");

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  const booking = parseBookingWindow(
    req.body.date,
    req.body.startTime,
    req.body.endTime,
  );

  if (!booking) {
    return renderError(res, 400, "Invalid booking time.");
  }

  const previousVehicleId = String(reservation.vehicleId._id);
  const nextVehicleId = req.body.vehicleId;
  const nextStatus = req.body.status;
  const vehicleChanged = previousVehicleId !== nextVehicleId;

  // Only Reserved/Active actually hold a vehicle exclusively — block the
  // save if the requested vehicle/window now conflicts with another booking
  // (the staff-facing booking form already guards against this; this path
  // didn't, so an admin edit could silently double-book a vehicle).
  if (HOLDING_STATUSES.includes(nextStatus)) {
    const conflictExists = await Reservation.exists({
      _id: { $ne: reservation._id },
      vehicleId: nextVehicleId,
      status: { $in: ["Pending", "Reserved", "Active"] },
      requestedStartTime: { $lt: booking.end },
      requestedEndTime: { $gt: booking.start },
    });

    if (conflictExists) {
      req.flash("error", "That vehicle is already booked during that window.");
      return res.redirect(`/admin/reservations/${reservation._id}/edit`);
    }
  }

  let newVehicle = reservation.vehicleId;
  if (vehicleChanged) {
    newVehicle = await Vehicle.findById(nextVehicleId, "make model keyCafeKeyId");
    if (!newVehicle) {
      req.flash("error", "That vehicle could not be found.");
      return res.redirect(`/admin/reservations/${reservation._id}/edit`);
    }
  }

  try {
    // An existing KeyCafe access is scoped to the OLD vehicle's key — if the
    // vehicle is being changed, that access no longer matches the
    // reservation and has to be revoked rather than left in place pointing
    // at the wrong vehicle.
    if (vehicleChanged && reservation.keyCafeAccess?.accessId) {
      await revokeReservationAccess(reservation);
    }

    if (vehicleChanged) {
      reservation.vehicleId = newVehicle;
    }

    if (HOLDING_STATUSES.includes(nextStatus) && !reservation.keyCafeAccess?.accessId) {
      await grantReservationAccess(reservation);
    } else if (
      ["Denied", "Cancelled"].includes(nextStatus) &&
      reservation.keyCafeAccess?.accessId
    ) {
      await revokeReservationAccess(reservation);
    }
  } catch (error) {
    console.error("KeyCafe access sync failed:", error);
    req.flash(
      "error",
      "Could not update KeyCafe access for this reservation. No changes were saved.",
    );
    return res.redirect(`/admin/reservations/${reservation._id}/edit`);
  }

  reservation.vehicleId = nextVehicleId;
  reservation.requestedStartTime = booking.start;
  reservation.requestedEndTime = booking.end;
  reservation.status = nextStatus;
  reservation.adminNotes = req.body.adminNotes || "";
  reservation.reviewedBy = res.locals.currentUser._id;
  reservation.reviewedAt = new Date();

  await reservation.save();

  // Keep Vehicle.status in sync: release the old vehicle if this
  // reservation no longer holds it, and reflect the new vehicle's state.
  if (vehicleChanged) {
    await freeVehicleIfHeldBy(previousVehicleId);
  }

  if (HOLDING_STATUSES.includes(nextStatus)) {
    await Vehicle.findByIdAndUpdate(nextVehicleId, {
      status: nextStatus === "Active" ? "In Use" : "Reserved",
    });
  } else if (["Denied", "Cancelled", "Completed"].includes(nextStatus)) {
    await freeVehicleIfHeldBy(nextVehicleId);
  }

  if (["Denied", "Cancelled"].includes(nextStatus)) {
    req.flash("success", "Booking canceled.");
  } else {
    req.flash("success", "Reservation updated.");
  }

  res.redirect("/admin/reservations");
};

exports.approveReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id)
    .populate("userId", "firstName lastName email")
    .populate("vehicleId", "make model keyCafeKeyId");

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  try {
    await grantReservationAccess(reservation);
    reservation.status = "Reserved";
    reservation.reviewedBy = res.locals.currentUser._id;
    reservation.reviewedAt = new Date();
    await reservation.save();

    await Vehicle.findByIdAndUpdate(reservation.vehicleId._id, {
      status: "Reserved",
    });

    req.flash("success", "Reservation approved and KeyCafe access granted.");
  } catch (error) {
    console.error("KeyCafe access creation failed:", error);
    req.flash(
      "error",
      "Could not create KeyCafe access for this reservation. Check your KeyCafe settings and try again.",
    );
  }

  res.redirect("/admin/reservations");
};

async function freeVehicleIfHeldBy(vehicleId) {
  const vehicle = await Vehicle.findById(vehicleId);
  if (vehicle && ["Reserved", "In Use"].includes(vehicle.status)) {
    vehicle.status = "Available";
    await vehicle.save();
  }
}

exports.denyReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  let revokeFailed = false;
  try {
    await revokeReservationAccess(reservation);
  } catch (error) {
    console.error("KeyCafe access cancellation failed:", error);
    revokeFailed = true;
  }

  reservation.status = "Denied";
  reservation.adminNotes = req.body.adminNotes || reservation.adminNotes;
  reservation.reviewedBy = res.locals.currentUser._id;
  reservation.reviewedAt = new Date();
  await reservation.save();
  await freeVehicleIfHeldBy(reservation.vehicleId);

  if (revokeFailed) {
    req.flash(
      "error",
      "Booking canceled, but the KeyCafe access could not be revoked automatically. Cancel it manually in KeyCafe.",
    );
  } else {
    req.flash("success", "Booking canceled.");
  }

  res.redirect("/admin/reservations");
};

exports.cancelReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!["Reserved", "Active"].includes(reservation.status)) {
    req.flash("error", "Only confirmed bookings can be canceled this way.");
    return res.redirect("/admin/reservations");
  }

  let revokeFailed = false;
  try {
    await revokeReservationAccess(reservation);
  } catch (error) {
    console.error("KeyCafe access cancellation failed:", error);
    revokeFailed = true;
  }

  reservation.status = "Cancelled";
  reservation.reviewedBy = res.locals.currentUser._id;
  reservation.reviewedAt = new Date();
  await reservation.save();
  await freeVehicleIfHeldBy(reservation.vehicleId);

  if (revokeFailed) {
    req.flash(
      "error",
      "Booking canceled, but the KeyCafe access could not be revoked automatically. Cancel it manually in KeyCafe.",
    );
  } else {
    req.flash("success", "Booking canceled by Transportation.");
  }

  res.redirect("/admin/reservations");
};

exports.deleteReservation = async (req, res) => {
  const reservation = await Reservation.findById(req.params.id);

  let revokeFailed = false;
  if (reservation) {
    try {
      await revokeReservationAccess(reservation);
      await reservation.save();
    } catch (error) {
      console.error("KeyCafe access cancellation failed:", error);
      revokeFailed = true;
    }
    await freeVehicleIfHeldBy(reservation.vehicleId);
  }

  await Reservation.findByIdAndDelete(req.params.id);

  if (revokeFailed) {
    req.flash(
      "error",
      "Booking canceled and removed, but the KeyCafe access could not be revoked automatically. Cancel it manually in KeyCafe.",
    );
  } else {
    req.flash("success", "Booking canceled and removed.");
  }

  res.redirect("/admin/reservations");
};

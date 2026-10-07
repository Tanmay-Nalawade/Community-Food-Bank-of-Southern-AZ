const { Op, UniqueConstraintError } = require("sequelize");
const { Reservation, Vehicle, User } = require("../../models");
const { renderError } = require("../../utils/httpError");
const { queryString, containsAny } = require("../../utils/query");
const {
  parseBookingWindow,
  hasOverlappingReservation,
  withVehicleLock,
} = require("../../utils/availability");
const {
  grantReservationAccess,
  revokeReservationAccess,
} = require("../../services/keycafe/reservationAccess");
const { fetchPage, PAGE_SIZE } = require("../../utils/pagination");
const { fillStartMileage } = require("../../services/odometer");

const HOLDING_STATUSES = ["Reserved", "Active"];

const USER_LIST = { association: "user", attributes: ["id", "firstName", "lastName", "email", "role"] };
const USER_CONTACT = { association: "user", attributes: ["id", "firstName", "lastName", "email"] };
const VEHICLE_LIST = { association: "vehicle", attributes: ["id", "make", "model", "year", "licensePlate"] };
const VEHICLE_KEY = { association: "vehicle", attributes: ["id", "make", "model", "keyCafeKeyId"] };
const BY_NAME = [["make", "ASC"], ["model", "ASC"]];

class SlotTakenError extends Error {}

// Approve/deny/cancel are triggered from both the reservations list and a
// single reservation's detail page — bouncing a detail-page action back to
// the list would be a jarring, pointless navigation, so the form carries
// where it was submitted from.
function redirectAfterAction(req, res, reservationId) {
  const target =
    req.body.returnTo === "detail" ? `/admin/reservations/${reservationId}` : "/admin/reservations";
  res.redirect(target);
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function buildReservationFilter(query) {
  const status = queryString(query.status);
  const vehicleId = queryString(query.vehicleId);
  const driver = queryString(query.driver);
  const startDate = queryString(query.startDate);
  const endDate = queryString(query.endDate);
  const where = {};

  if (status) {
    where.status = status;
  }

  if (vehicleId) {
    where.vehicleId = vehicleId;
  }

  if (driver) {
    const matchingUsers = await User.findAll({
      attributes: ["id"],
      where: containsAny(["firstName", "lastName", "email"], driver),
      raw: true,
    });
    // An empty IN matches nothing, which is the right answer here: no
    // matching driver means no matching reservations.
    where.userId = { [Op.in]: matchingUsers.map((user) => user.id) };
  }

  const from = startDate && validDate(`${startDate}T00:00`);
  const to = endDate && validDate(`${endDate}T23:59:59`);
  if (from || to) {
    where.requestedStartTime = {};
    if (from) {
      where.requestedStartTime[Op.gte] = from;
    }
    if (to) {
      where.requestedStartTime[Op.lte] = to;
    }
  }

  return where;
}

function filterQueryString(query) {
  const params = new URLSearchParams();
  ["status", "vehicleId", "driver", "startDate", "endDate"].forEach((key) => {
    const value = queryString(query[key]);
    if (value) {
      params.set(key, value);
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function fetchReservations(where, skip, limit) {
  return Reservation.findAll({
    where,
    include: [USER_LIST, VEHICLE_LIST],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    offset: skip,
    limit,
  });
}

function fetchPastReservations(now) {
  return (skip, limit) =>
    Reservation.findAll({
      where: { requestedEndTime: { [Op.lt]: now } },
      include: [USER_LIST, VEHICLE_LIST],
      order: [["requestedEndTime", "DESC"], ["id", "DESC"]],
      offset: skip,
      limit,
    });
}

exports.listReservations = async (req, res) => {
  const where = await buildReservationFilter(req.query);

  const [{ items: reservations, hasMore, nextSkip }, vehicles] = await Promise.all([
    fetchPage((skip, limit) => fetchReservations(where, skip, limit), 0),
    Vehicle.findAll({ order: BY_NAME }),
  ]);

  res.render("admin/reservations/index", {
    title: "Manage Reservations",
    reservations,
    vehicles,
    filters: {
      status: queryString(req.query.status),
      vehicleId: queryString(req.query.vehicleId),
      driver: queryString(req.query.driver),
      startDate: queryString(req.query.startDate),
      endDate: queryString(req.query.endDate),
    },
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    moreUrl: `/admin/reservations/more${filterQueryString(req.query)}`,
    activeNav: "admin-reservations",
  });
};

exports.moreReservations = async (req, res) => {
  const where = await buildReservationFilter(req.query);
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: reservations, hasMore } = await fetchPage(
    (s, limit) => fetchReservations(where, s, limit),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/reservations/_rows", { reservations });
};

exports.pastReservations = async (req, res) => {
  const { items: reservations, hasMore, nextSkip } = await fetchPage(
    fetchPastReservations(new Date()),
    0,
  );

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
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: reservations, hasMore } = await fetchPage(
    fetchPastReservations(new Date()),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("admin/reservations/_history-rows", { reservations });
};

exports.showReservation = async (req, res) => {
  const reservation = await Reservation.findByPk(req.params.id, {
    include: [
      USER_LIST,
      "vehicle",
      { association: "reviewedBy", attributes: ["id", "firstName", "lastName"] },
    ],
  });

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
  const reservation = await Reservation.findByPk(req.params.id, {
    include: [USER_CONTACT, "vehicle"],
  });

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  const vehicles = await Vehicle.findAll({ order: BY_NAME });

  res.render("admin/reservations/edit", {
    title: "Edit Reservation",
    reservation,
    vehicles,
    activeNav: "admin-reservations",
  });
};

exports.updateReservation = async (req, res) => {
  const reservation = await Reservation.findByPk(req.params.id, {
    include: [USER_CONTACT, VEHICLE_KEY],
  });

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

  const previousVehicleId = String(reservation.vehicleId);
  const nextVehicleId = req.body.vehicleId;
  const nextStatus = req.body.status;
  const vehicleChanged = previousVehicleId !== nextVehicleId;
  const holdsVehicle = HOLDING_STATUSES.includes(nextStatus);
  const overlapOptions = { excludeReservationId: reservation.id };

  // Only Reserved/Active actually hold a vehicle exclusively — block the
  // save if the requested vehicle/window now conflicts with another booking
  // (the staff-facing booking form already guards against this; this path
  // didn't, so an admin edit could silently double-book a vehicle). This is
  // the fast unlocked check; it's repeated under the vehicle lock below.
  if (holdsVehicle && (await hasOverlappingReservation(nextVehicleId, booking, overlapOptions))) {
    req.flash("error", "That vehicle is already booked during that window.");
    return res.redirect(`/admin/reservations/${reservation.id}/edit`);
  }

  let newVehicle = reservation.vehicle;
  if (vehicleChanged) {
    newVehicle = await Vehicle.findByPk(nextVehicleId, {
      attributes: ["id", "make", "model", "keyCafeKeyId"],
    });
    if (!newVehicle) {
      req.flash("error", "That vehicle could not be found.");
      return res.redirect(`/admin/reservations/${reservation.id}/edit`);
    }
  }

  let grantedHere = false;
  try {
    // An existing KeyCafe access is scoped to the OLD vehicle's key — if the
    // vehicle is being changed, that access no longer matches the
    // reservation and has to be revoked rather than left in place pointing
    // at the wrong vehicle.
    if (vehicleChanged && reservation.keyCafeAccessId) {
      await revokeReservationAccess(reservation);
    }

    if (holdsVehicle && !reservation.keyCafeAccessId) {
      await grantReservationAccess(reservation, reservation.user, newVehicle);
      grantedHere = true;
    } else if (["Denied", "Cancelled"].includes(nextStatus) && reservation.keyCafeAccessId) {
      await revokeReservationAccess(reservation);
    }
  } catch (error) {
    console.error("KeyCafe access sync failed:", error);
    req.flash(
      "error",
      "Could not update KeyCafe access for this reservation. No changes were saved.",
    );
    return res.redirect(`/admin/reservations/${reservation.id}/edit`);
  }

  reservation.vehicleId = newVehicle.id;
  reservation.requestedStartTime = booking.start;
  reservation.requestedEndTime = booking.end;
  reservation.status = nextStatus;
  reservation.adminNotes = req.body.adminNotes || "";
  reservation.reviewedById = res.locals.currentUser.id;
  reservation.reviewedAt = new Date();
  if (nextStatus === "Active") {
    await fillStartMileage(reservation);
  }

  try {
    await withVehicleLock(newVehicle.id, async ({ transaction }) => {
      if (
        holdsVehicle &&
        (await hasOverlappingReservation(newVehicle.id, booking, { ...overlapOptions, transaction }))
      ) {
        throw new SlotTakenError();
      }
      await reservation.save({ transaction });
    });
  } catch (error) {
    if (!(error instanceof SlotTakenError || error instanceof UniqueConstraintError)) {
      throw error;
    }
    // Lost a race for the slot after already granting KeyCafe access for
    // it — take that access back so it doesn't outlive the failed save.
    if (grantedHere) {
      try {
        await revokeReservationAccess(reservation);
      } catch (revokeError) {
        console.error("Failed to revoke KeyCafe access after a lost booking race:", revokeError);
      }
    }
    req.flash("error", "That vehicle was just booked by someone else for that time.");
    return res.redirect(`/admin/reservations/${reservation.id}/edit`);
  }

  // Keep Vehicle.status in sync: release the old vehicle if this
  // reservation no longer holds it, and reflect the new vehicle's state.
  if (vehicleChanged) {
    await freeVehicleIfHeldBy(previousVehicleId);
  }

  if (holdsVehicle) {
    await Vehicle.update(
      { status: nextStatus === "Active" ? "In Use" : "Reserved" },
      { where: { id: newVehicle.id } },
    );
  } else if (["Denied", "Cancelled", "Completed"].includes(nextStatus)) {
    await freeVehicleIfHeldBy(newVehicle.id);
  }

  if (["Denied", "Cancelled"].includes(nextStatus)) {
    req.flash("success", "Booking canceled.");
  } else {
    req.flash("success", "Reservation updated.");
  }

  res.redirect("/admin/reservations");
};

exports.approveReservation = async (req, res) => {
  const reservation = await Reservation.findByPk(req.params.id, {
    include: [USER_CONTACT, VEHICLE_KEY],
  });

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  try {
    await grantReservationAccess(reservation, reservation.user, reservation.vehicle);
    reservation.status = "Reserved";
    reservation.reviewedById = res.locals.currentUser.id;
    reservation.reviewedAt = new Date();
    await reservation.save();

    await Vehicle.update({ status: "Reserved" }, { where: { id: reservation.vehicleId } });

    req.flash("success", "Reservation approved and KeyCafe access granted.");
  } catch (error) {
    console.error("KeyCafe access creation failed:", error);
    req.flash(
      "error",
      "Could not create KeyCafe access for this reservation. Check your KeyCafe settings and try again.",
    );
  }

  redirectAfterAction(req, res, reservation.id);
};

// Single conditional UPDATE, so it can't clobber a status (e.g.
// Maintenance) that someone else set in between a read and a write.
async function freeVehicleIfHeldBy(vehicleId) {
  await Vehicle.update(
    { status: "Available" },
    { where: { id: vehicleId, status: { [Op.in]: ["Reserved", "In Use"] } } },
  );
}

exports.denyReservation = async (req, res) => {
  const reservation = await Reservation.findByPk(req.params.id);
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
  reservation.reviewedById = res.locals.currentUser.id;
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

  redirectAfterAction(req, res, reservation.id);
};

exports.cancelReservation = async (req, res) => {
  const reservation = await Reservation.findByPk(req.params.id);
  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!["Reserved", "Active"].includes(reservation.status)) {
    req.flash("error", "Only confirmed bookings can be canceled this way.");
    return redirectAfterAction(req, res, reservation.id);
  }

  let revokeFailed = false;
  try {
    await revokeReservationAccess(reservation);
  } catch (error) {
    console.error("KeyCafe access cancellation failed:", error);
    revokeFailed = true;
  }

  reservation.status = "Cancelled";
  reservation.reviewedById = res.locals.currentUser.id;
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

  redirectAfterAction(req, res, reservation.id);
};

exports.deleteReservation = async (req, res) => {
  const reservation = await Reservation.findByPk(req.params.id);

  let revokeFailed = false;
  if (reservation) {
    try {
      await revokeReservationAccess(reservation);
    } catch (error) {
      console.error("KeyCafe access cancellation failed:", error);
      revokeFailed = true;
    }
    await freeVehicleIfHeldBy(reservation.vehicleId);
    // access_logs / vehicle_issues rows pointing at it are kept, with their
    // reservation_id set to NULL by the foreign key.
    await reservation.destroy();
  }

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

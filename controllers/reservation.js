const { Op, UniqueConstraintError } = require("sequelize");
const { Reservation, Vehicle, VehicleIssue } = require("../models");
const { renderError } = require("../utils/httpError");
const {
  parseBookingWindow,
  hasOverlappingReservation,
  withVehicleLock,
  findTightPrecedingBooking,
  formatTimeLabel,
} = require("../utils/availability");
const {
  grantReservationAccess,
  revokeReservationAccess,
} = require("../services/keycafe/reservationAccess");
const { sendBookingConfirmation } = require("../services/email/reservationNotifications");
const { notifyVehicleIssues } = require("../services/email/issueNotifications");
const {
  OdometerError,
  applyEndMileage,
  afterEndMileageSaved,
} = require("../services/odometer");
const { fetchPage, PAGE_SIZE } = require("../utils/pagination");
const {
  VEHICLE_INSPECTION_GROUPS,
  VEHICLE_INSPECTION_ITEMS,
} = require("../utils/vehicleInspectionItems");

const CANCELABLE_STATUSES = ["Pending", "Reserved"];
const REPORTABLE_STATUSES = ["Active", "Completed"];
// Mileage also allows "Reserved" so a driver can still report a trip when
// KeyCafe never sent the pickup event that flips it to Active (KeyCafe not
// configured, or the webhook missed) — Report Issue and Return Vehicle stay
// restricted to trips that have actually started.
const MILEAGE_REPORTABLE_STATUSES = ["Reserved", "Active", "Completed"];
const CURRENT_STATUSES = ["Reserved", "Active"];
const UPCOMING_STATUSES = ["Pending", "Reserved", "Active"];

const VEHICLE_SUMMARY = { association: "vehicle", attributes: ["id", "make", "model", "year", "licensePlate"] };
const VEHICLE_WITH_ODOMETER = {
  association: "vehicle",
  attributes: [...VEHICLE_SUMMARY.attributes, "currentMileage"],
};

// The start reading shown on the mileage/return forms: the trip's own once
// it has begun, otherwise what it will be — the vehicle's current odometer.
function startReadingFor(reservation) {
  return reservation.startMileage ?? reservation.vehicle?.currentMileage ?? null;
}

// Thrown inside a withVehicleLock() transaction to roll it back when the
// locked re-check finds someone else got the slot first.
class SlotTakenError extends Error {}

// A driver's current/upcoming bookings are naturally small (bounded by how
// many trips one person can have going on or scheduled at once), so those
// are fetched in full. Past bookings accumulate for as long as someone's
// been on staff, so that bucket is the one that needs pagination.
function buildPastFilter(userId, now) {
  return {
    userId,
    [Op.or]: [
      { status: { [Op.in]: ["Completed", "Cancelled", "Denied"] } },
      { status: "Pending", requestedStartTime: { [Op.lte]: now } },
      { status: { [Op.in]: CURRENT_STATUSES }, requestedEndTime: { [Op.lte]: now } },
    ],
  };
}

function fetchPastBookings(userId, now) {
  return (skip, limit) =>
    Reservation.findAll({
      where: buildPastFilter(userId, now),
      include: ["vehicle"],
      order: [["requestedStartTime", "DESC"], ["id", "DESC"]],
      offset: skip,
      limit,
    });
}

// Same "past" definition as fetchPastBookings, additionally bounded to the
// last 365 days — the dedicated Booking History page (linked from the
// account dropdown) is deliberately scoped shorter than the dashboard's
// unbounded Past Bookings section.
function fetchHistory(userId, now) {
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  return (skip, limit) =>
    Reservation.findAll({
      where: {
        ...buildPastFilter(userId, now),
        requestedStartTime: { [Op.gte]: oneYearAgo },
      },
      include: ["vehicle"],
      order: [["requestedStartTime", "DESC"], ["id", "DESC"]],
      offset: skip,
      limit,
    });
}

function findOwnReservation(req, res, options = {}) {
  return Reservation.findOne({
    where: { id: req.params.id, userId: res.locals.currentUser.id },
    ...options,
  });
}

exports.createRequest = async (req, res) => {
  const booking = parseBookingWindow(
    req.body.date,
    req.body.startTime,
    req.body.endTime,
  );

  if (!booking) {
    req.flash("error", "Please choose a valid date and time for your booking.");
    return res.redirect(`/vehicles/${req.params.vehicleId}`);
  }

  const vehicle = await Vehicle.findByPk(req.params.vehicleId);
  if (!vehicle) {
    req.flash("error", "That vehicle could not be found.");
    return res.redirect("/vehicles");
  }

  // Checks ANY overlapping reservation for this vehicle, including one the
  // same user already holds — a conflict is rejected outright below, so a
  // duplicate self-booking is already caught here too (no separate check
  // needed). This is a plain, unlocked read for a fast answer in the common
  // case; the real race-safe check is repeated under the vehicle lock below.
  if (await hasOverlappingReservation(vehicle.id, booking)) {
    req.flash(
      "error",
      "That vehicle isn't available for the time you selected. Please choose a different time or vehicle.",
    );
    return res.redirect(`/vehicles/${vehicle.id}`);
  }

  // Not a hard block — just a heads-up before committing, so bounce back to
  // the vehicle page (carrying the submitted answers along) instead of
  // creating the reservation, unless the driver already clicked through the
  // warning ("Yes, book anyway" posts confirmTightGap=true).
  if (req.body.confirmTightGap !== "true") {
    const tightPrevious = await findTightPrecedingBooking(vehicle.id, booking);
    if (tightPrevious) {
      const qs = new URLSearchParams({
        date: req.body.date,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        staffNotes: req.body.staffNotes || "",
        tripFoodRelated: req.body.tripFoodRelated || "",
        tripFoodRelatedDetail: req.body.tripFoodRelatedDetail || "",
        confirm: "gap",
      });
      return res.redirect(`/vehicles/${vehicle.id}?${qs.toString()}`);
    }
  }

  // The check above and the insert must be atomic, or two people submitting
  // an overlapping request for the same vehicle within milliseconds of each
  // other could both pass it. Locking the vehicle row serializes them: the
  // second request blocks until the first commits, then its own re-check
  // sees the first reservation and backs off.
  let reservation;
  try {
    reservation = await withVehicleLock(vehicle.id, async ({ transaction }) => {
      if (await hasOverlappingReservation(vehicle.id, booking, { transaction })) {
        throw new SlotTakenError();
      }
      return Reservation.create(
        {
          userId: res.locals.currentUser.id,
          vehicleId: vehicle.id,
          requestedStartTime: booking.start,
          requestedEndTime: booking.end,
          staffNotes: req.body.staffNotes || "",
          tripFoodRelated: req.body.tripFoodRelated,
          tripFoodRelatedDetail:
            req.body.tripFoodRelated === "Other" ? req.body.tripFoodRelatedDetail || "" : "",
          status: "Reserved",
        },
        { transaction },
      );
    });
  } catch (error) {
    if (error instanceof SlotTakenError) {
      req.flash(
        "error",
        "That vehicle was just booked by someone else for an overlapping time. Please choose a different time or vehicle.",
      );
      return res.redirect(`/vehicles/${vehicle.id}`);
    }
    if (error instanceof UniqueConstraintError) {
      req.flash(
        "error",
        "That vehicle isn't available for the time you selected. Please choose a different time or vehicle.",
      );
      return res.redirect(`/vehicles/${vehicle.id}`);
    }
    throw error;
  }

  try {
    await grantReservationAccess(reservation, res.locals.currentUser, vehicle);
    await reservation.save();
    await Vehicle.update({ status: "Reserved" }, { where: { id: vehicle.id } });
    await sendBookingConfirmation(reservation, res.locals.currentUser, vehicle);
    req.flash("success", "Vehicle booked! Your KeyCafe pickup code is ready on your dashboard.");
  } catch (error) {
    console.error("KeyCafe access creation failed:", error);
    reservation.status = "Pending";
    reservation.adminNotes = "Auto-confirm failed: KeyCafe access could not be created.";
    await reservation.save();
    await sendBookingConfirmation(reservation, res.locals.currentUser, vehicle);
    req.flash(
      "error",
      "Your booking was saved, but automatic KeyCafe access failed. Transportation will follow up shortly.",
    );
  }

  res.redirect("/reservations/mine");
};

exports.mine = async (req, res) => {
  const userId = res.locals.currentUser.id;
  const now = new Date();

  const [currentBookings, upcomingBookings, pastPage] = await Promise.all([
    Reservation.findAll({
      where: {
        userId,
        status: { [Op.in]: CURRENT_STATUSES },
        requestedStartTime: { [Op.lte]: now },
        requestedEndTime: { [Op.gt]: now },
      },
      include: ["vehicle"],
      order: [["requestedStartTime", "ASC"]],
    }),

    Reservation.findAll({
      where: {
        userId,
        status: { [Op.in]: UPCOMING_STATUSES },
        requestedStartTime: { [Op.gt]: now },
      },
      include: ["vehicle"],
      order: [["requestedStartTime", "ASC"]],
    }),

    fetchPage(fetchPastBookings(userId, now), 0),
  ]);

  res.render("reservations/mine", {
    title: "My Dashboard",
    currentBookings,
    upcomingBookings,
    pastBookings: pastPage.items,
    pastHasMore: pastPage.hasMore,
    pastNextSkip: pastPage.nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "dashboard",
  });
};

exports.morePast = async (req, res) => {
  const userId = res.locals.currentUser.id;
  const now = new Date();
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: reservations, hasMore } = await fetchPage(
    fetchPastBookings(userId, now),
    skip,
  );

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("partials/_booking-cards", { reservations, muted: true });
};

exports.history = async (req, res) => {
  const userId = res.locals.currentUser.id;
  const now = new Date();

  const { items: reservations, hasMore, nextSkip } = await fetchPage(fetchHistory(userId, now), 0);

  res.render("reservations/history", {
    title: "Booking History",
    reservations,
    hasMore,
    nextSkip,
    pageSize: PAGE_SIZE,
    activeNav: "account",
  });
};

exports.moreHistory = async (req, res) => {
  const userId = res.locals.currentUser.id;
  const now = new Date();
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: reservations, hasMore } = await fetchPage(fetchHistory(userId, now), skip);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("partials/_booking-cards", { reservations, muted: true });
};

exports.editForm = async (req, res) => {
  const reservation = await findOwnReservation(req, res, { include: ["vehicle"] });

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (reservation.status !== "Pending") {
    req.flash("error", "Only pending requests can be edited. Contact an admin to change an approved booking.");
    return res.redirect("/reservations/mine");
  }

  if (reservation.requestedEndTime <= new Date()) {
    req.flash("error", "This request's time has already passed and can no longer be edited. Contact an admin.");
    return res.redirect("/reservations/mine");
  }

  const formValues = {
    date: new Date(reservation.requestedStartTime).toISOString().split("T")[0],
    startTime: new Date(reservation.requestedStartTime).toTimeString().slice(0, 5),
    endTime: new Date(reservation.requestedEndTime).toTimeString().slice(0, 5),
    staffNotes: reservation.staffNotes || "",
    tripFoodRelated: reservation.tripFoodRelated || "",
    tripFoodRelatedDetail: reservation.tripFoodRelatedDetail || "",
  };

  // Same "confirm=gap" bounce-back as the new-booking flow — see
  // createRequest/updateRequest.
  let gapWarning = null;

  if (req.query.confirm === "gap") {
    const booking = parseBookingWindow(req.query.date, req.query.startTime, req.query.endTime);
    if (booking) {
      formValues.date = req.query.date;
      formValues.startTime = req.query.startTime;
      formValues.endTime = req.query.endTime;
      formValues.staffNotes = req.query.staffNotes || "";
      formValues.tripFoodRelated = req.query.tripFoodRelated || "";
      formValues.tripFoodRelatedDetail = req.query.tripFoodRelatedDetail || "";

      const tightPrevious = await findTightPrecedingBooking(reservation.vehicleId, booking, {
        excludeReservationId: reservation.id,
      });
      if (tightPrevious) {
        gapWarning = { previousEndLabel: formatTimeLabel(tightPrevious.requestedEndTime) };
      }
    }
  }

  res.render("reservations/edit", {
    title: "Edit Booking Request",
    reservation,
    formValues,
    gapWarning,
    activeNav: "dashboard",
  });
};

exports.updateRequest = async (req, res) => {
  const reservation = await findOwnReservation(req, res);

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (reservation.status !== "Pending") {
    req.flash("error", "Only pending requests can be edited.");
    return res.redirect("/reservations/mine");
  }

  if (reservation.requestedEndTime <= new Date()) {
    req.flash("error", "This request's time has already passed and can no longer be edited. Contact an admin.");
    return res.redirect("/reservations/mine");
  }

  const booking = parseBookingWindow(
    req.body.date,
    req.body.startTime,
    req.body.endTime,
  );

  if (!booking) {
    req.flash("error", "Please choose a valid date and time.");
    return res.redirect(`/reservations/${reservation.id}/edit`);
  }

  const overlapOptions = { excludeReservationId: reservation.id };

  if (await hasOverlappingReservation(reservation.vehicleId, booking, overlapOptions)) {
    req.flash("error", "That vehicle is already booked during that window.");
    return res.redirect(`/reservations/${reservation.id}/edit`);
  }

  if (req.body.confirmTightGap !== "true") {
    const tightPrevious = await findTightPrecedingBooking(reservation.vehicleId, booking, overlapOptions);
    if (tightPrevious) {
      const qs = new URLSearchParams({
        date: req.body.date,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        staffNotes: req.body.staffNotes || "",
        tripFoodRelated: req.body.tripFoodRelated || "",
        tripFoodRelatedDetail: req.body.tripFoodRelatedDetail || "",
        confirm: "gap",
      });
      return res.redirect(`/reservations/${reservation.id}/edit?${qs.toString()}`);
    }
  }

  // Same race as createRequest (see its comment) — re-check and save under
  // the vehicle lock so the change either lands cleanly or not at all.
  try {
    await withVehicleLock(reservation.vehicleId, async ({ transaction }) => {
      if (await hasOverlappingReservation(reservation.vehicleId, booking, { ...overlapOptions, transaction })) {
        throw new SlotTakenError();
      }
      reservation.requestedStartTime = booking.start;
      reservation.requestedEndTime = booking.end;
      reservation.staffNotes = req.body.staffNotes || "";
      reservation.tripFoodRelated = req.body.tripFoodRelated;
      reservation.tripFoodRelatedDetail =
        req.body.tripFoodRelated === "Other" ? req.body.tripFoodRelatedDetail || "" : "";
      await reservation.save({ transaction });
    });
  } catch (error) {
    if (error instanceof SlotTakenError || error instanceof UniqueConstraintError) {
      req.flash(
        "error",
        "That vehicle was just booked by someone else for that time. Please choose a different time.",
      );
      return res.redirect(`/reservations/${reservation.id}/edit`);
    }
    throw error;
  }

  req.flash("success", "Booking request updated.");
  res.redirect("/reservations/mine");
};

exports.cancelRequest = async (req, res) => {
  const reservation = await findOwnReservation(req, res);

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (
    !CANCELABLE_STATUSES.includes(reservation.status) ||
    reservation.requestedEndTime <= new Date()
  ) {
    req.flash("error", "This booking can no longer be canceled here. Contact an admin.");
    return res.redirect("/reservations/mine");
  }

  let revokeFailed = false;
  try {
    await revokeReservationAccess(reservation);
  } catch (error) {
    console.error("KeyCafe access cancellation failed:", error);
    revokeFailed = true;
  }

  reservation.status = "Cancelled";
  await reservation.save();

  if (revokeFailed) {
    req.flash(
      "error",
      "Booking canceled, but the KeyCafe access could not be revoked automatically. Contact an admin.",
    );
  } else {
    req.flash("success", "Booking canceled.");
  }

  res.redirect("/reservations/mine");
};

exports.mileageForm = async (req, res) => {
  const reservation = await findOwnReservation(req, res, { include: [VEHICLE_WITH_ODOMETER] });

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!MILEAGE_REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Mileage can only be reported for a confirmed, active, or completed trip.");
    return res.redirect("/reservations/mine");
  }

  res.render("reservations/mileage", {
    title: "Report Mileage",
    reservation,
    startReading: startReadingFor(reservation),
    activeNav: "dashboard",
  });
};

exports.submitMileage = async (req, res) => {
  const reservation = await findOwnReservation(req, res);

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!MILEAGE_REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Mileage can only be reported for a confirmed, active, or completed trip.");
    return res.redirect("/reservations/mine");
  }

  // The start reading is never taken from the form — it comes from the
  // vehicle's odometer (services/odometer.js).
  const { endMileage, fuelLevelEndPercent, otherDutyNote } = req.body;
  const hasEndMileage = endMileage !== "" && endMileage !== undefined;

  if (hasEndMileage) {
    try {
      await applyEndMileage(reservation, Number(endMileage));
    } catch (error) {
      if (error instanceof OdometerError) {
        req.flash("error", error.message);
        return res.redirect(`/reservations/${reservation.id}/mileage`);
      }
      throw error;
    }
  }
  if (fuelLevelEndPercent !== "" && fuelLevelEndPercent !== undefined) {
    reservation.fuelLevelEndPercent = Number(fuelLevelEndPercent);
  }

  reservation.preTripInspectionPassed = req.body.preTripInspectionPassed === "on";
  reservation.droppedOffFood = req.body.droppedOffFood === "on";
  reservation.pickedUpFood = req.body.pickedUpFood === "on";
  reservation.otherDuty = req.body.otherDuty === "on";
  reservation.otherDutyNote = (otherDutyNote || "").trim();
  reservation.washed = req.body.washed === "on";

  await reservation.save();
  if (hasEndMileage) {
    await afterEndMileageSaved(reservation);
  }

  req.flash("success", "Mileage reported. Thanks!");
  res.redirect("/reservations/mine");
};

exports.issueForm = async (req, res) => {
  const reservation = await findOwnReservation(req, res, { include: [VEHICLE_SUMMARY] });

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Issues can only be reported for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  res.render("reservations/issue", {
    title: "Report an Issue",
    reservation,
    activeNav: "dashboard",
  });
};

exports.submitIssue = async (req, res) => {
  const reservation = await findOwnReservation(req, res);

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Issues can only be reported for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  const description = (req.body.description || "").trim();

  if (!description) {
    req.flash("error", "Please describe the issue.");
    return res.redirect(`/reservations/${reservation.id}/issue`);
  }

  await VehicleIssue.create({
    vehicleId: reservation.vehicleId,
    description,
    reportedById: res.locals.currentUser.id,
    reservationId: reservation.id,
    reviewed: false,
  });
  await notifyVehicleIssues({
    vehicleId: reservation.vehicleId,
    descriptions: [description],
    reporter: res.locals.currentUser,
    reservationId: reservation.id,
    source: "during their trip",
  });

  req.flash("success", "Issue reported to Transportation for review.");
  res.redirect("/reservations/mine");
};

// "Return Vehicle": an optional, encouraged-not-required inspection shown
// when a driver is done with a trip. There's no real "return" action in
// KeyCafe itself (one access code covers both pickup and drop-off — the
// physical box detects direction on its own), so this is purely an in-app
// checkpoint: fill out the inspection or skip it, either way land on a
// confirmation screen reminding them of their existing drop-off code.
exports.inspectionForm = async (req, res) => {
  const reservation = await findOwnReservation(req, res, { include: [VEHICLE_WITH_ODOMETER] });

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "The vehicle can only be returned for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  res.render("reservations/inspection", {
    title: "Return Vehicle",
    reservation,
    startReading: startReadingFor(reservation),
    groups: VEHICLE_INSPECTION_GROUPS,
    activeNav: "dashboard",
  });
};

exports.submitInspection = async (req, res) => {
  const reservation = await findOwnReservation(req, res, { include: [VEHICLE_SUMMARY] });

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "The vehicle can only be returned for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  try {
    await applyEndMileage(reservation, Number(req.body.endMileage));
  } catch (error) {
    if (error instanceof OdometerError) {
      req.flash("error", error.message);
      return res.redirect(`/reservations/${reservation.id}/inspection`);
    }
    throw error;
  }

  const skipped = req.body.action === "skip";

  reservation.inspectionCompletedAt = new Date();
  reservation.inspectionSkipped = skipped;

  if (skipped) {
    reservation.inspectionConditionSatisfactory = null;
    reservation.inspectionRemarks = "";
  } else {
    const defects = (req.body.defects || []).filter((item) =>
      VEHICLE_INSPECTION_ITEMS.includes(item),
    );

    reservation.inspectionConditionSatisfactory = req.body.conditionSatisfactory === "on";
    reservation.inspectionRemarks = (req.body.remarks || "").trim();

    if (defects.length) {
      await VehicleIssue.bulkCreate(
        defects.map((item) => ({
          vehicleId: reservation.vehicleId,
          description: `Vehicle inspection: ${item}`,
          reportedById: res.locals.currentUser.id,
          reservationId: reservation.id,
          reviewed: false,
        })),
      );
      await notifyVehicleIssues({
        vehicleId: reservation.vehicleId,
        descriptions: defects.map((item) => `Vehicle inspection: ${item}`),
        reporter: res.locals.currentUser,
        reservationId: reservation.id,
        source: "on the Return Vehicle inspection",
      });
    }
  }

  await reservation.save();
  await afterEndMileageSaved(reservation);

  res.render("reservations/return-confirmation", {
    title: "Vehicle Returned",
    reservation,
    skipped,
    activeNav: "dashboard",
  });
};

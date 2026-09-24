const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");
const { renderError } = require("../utils/httpError");
const {
  parseBookingWindow,
  findTightPrecedingBooking,
  formatTimeLabel,
} = require("../utils/availability");
const {
  grantReservationAccess,
  revokeReservationAccess,
} = require("../services/keycafe/reservationAccess");
const { sendBookingConfirmation } = require("../services/email/reservationNotifications");
const { fetchPage, PAGE_SIZE } = require("../utils/pagination");
const {
  VEHICLE_INSPECTION_GROUPS,
  VEHICLE_INSPECTION_ITEMS,
} = require("../utils/vehicleInspectionItems");

const CANCELABLE_STATUSES = ["Pending", "Reserved"];
const REPORTABLE_STATUSES = ["Active", "Completed"];
const CURRENT_STATUSES = ["Reserved", "Active"];
const UPCOMING_STATUSES = ["Pending", "Reserved", "Active"];

// A driver's current/upcoming bookings are naturally small (bounded by how
// many trips one person can have going on or scheduled at once), so those
// are fetched in full. Past bookings accumulate for as long as someone's
// been on staff, so that bucket is the one that needs pagination.
function buildPastFilter(userId, now) {
  return {
    userId,
    $or: [
      { status: { $in: ["Completed", "Cancelled", "Denied"] } },
      { status: "Pending", requestedStartTime: { $lte: now } },
      { status: { $in: CURRENT_STATUSES }, requestedEndTime: { $lte: now } },
    ],
  };
}

function fetchPastBookings(userId, now) {
  return (skip, limit) =>
    Reservation.find(buildPastFilter(userId, now))
      .populate("vehicleId")
      .sort({ requestedStartTime: -1 })
      .skip(skip)
      .limit(limit);
}

// Same "past" definition as fetchPastBookings, additionally bounded to the
// last 365 days — the dedicated Booking History page (linked from the
// account dropdown) is deliberately scoped shorter than the dashboard's
// unbounded Past Bookings section.
function fetchHistory(userId, now) {
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  return (skip, limit) =>
    Reservation.find({
      ...buildPastFilter(userId, now),
      requestedStartTime: { $gte: oneYearAgo },
    })
      .populate("vehicleId")
      .sort({ requestedStartTime: -1 })
      .skip(skip)
      .limit(limit);
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

  const vehicle = await Vehicle.findById(req.params.vehicleId);
  if (!vehicle) {
    req.flash("error", "That vehicle could not be found.");
    return res.redirect("/vehicles");
  }

  // Checks ANY overlapping reservation for this vehicle, including one the
  // same user already holds — a conflict is rejected outright below, so a
  // duplicate self-booking is already caught here too (no separate check
  // needed). The unique index on Reservation is still the last-resort
  // guard against two simultaneous requests racing past this check.
  const hasConflict = await Reservation.exists({
    vehicleId: vehicle._id,
    status: { $in: ["Pending", "Reserved", "Active"] },
    requestedStartTime: { $lt: booking.end },
    requestedEndTime: { $gt: booking.start },
  });

  if (hasConflict) {
    req.flash(
      "error",
      "That vehicle isn't available for the time you selected. Please choose a different time or vehicle.",
    );
    return res.redirect(`/vehicles/${vehicle._id}`);
  }

  // Not a hard block — just a heads-up before committing, so bounce back to
  // the vehicle page (carrying the submitted answers along) instead of
  // creating the reservation, unless the driver already clicked through the
  // warning ("Yes, book anyway" posts confirmTightGap=true).
  if (req.body.confirmTightGap !== "true") {
    const tightPrevious = await findTightPrecedingBooking(vehicle._id, booking);
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
      return res.redirect(`/vehicles/${vehicle._id}?${qs.toString()}`);
    }
  }

  let reservation;
  try {
    reservation = await Reservation.create({
      userId: res.locals.currentUser._id,
      vehicleId: vehicle._id,
      requestedStartTime: booking.start,
      requestedEndTime: booking.end,
      staffNotes: req.body.staffNotes || "",
      tripFoodRelated: req.body.tripFoodRelated,
      tripFoodRelatedDetail:
        req.body.tripFoodRelated === "Other" ? req.body.tripFoodRelatedDetail || "" : "",
      status: "Reserved",
    });
  } catch (error) {
    if (error.code === 11000) {
      req.flash(
        "error",
        "That vehicle isn't available for the time you selected. Please choose a different time or vehicle.",
      );
      return res.redirect(`/vehicles/${vehicle._id}`);
    }
    throw error;
  }

  try {
    await reservation.populate("userId", "firstName lastName email");
    await reservation.populate("vehicleId", "make model keyCafeKeyId");
    await grantReservationAccess(reservation);
    await reservation.save();
    await Vehicle.findByIdAndUpdate(vehicle._id, { status: "Reserved" });
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
  const userId = res.locals.currentUser._id;
  const now = new Date();

  const [currentBookings, upcomingBookings, pastPage] = await Promise.all([
    Reservation.find({
      userId,
      status: { $in: CURRENT_STATUSES },
      requestedStartTime: { $lte: now },
      requestedEndTime: { $gt: now },
    })
      .populate("vehicleId")
      .sort({ requestedStartTime: 1 }),

    Reservation.find({
      userId,
      status: { $in: UPCOMING_STATUSES },
      requestedStartTime: { $gt: now },
    })
      .populate("vehicleId")
      .sort({ requestedStartTime: 1 }),

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
  const userId = res.locals.currentUser._id;
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
  const userId = res.locals.currentUser._id;
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
  const userId = res.locals.currentUser._id;
  const now = new Date();
  const skip = Math.max(0, Number(req.query.skip) || 0);

  const { items: reservations, hasMore } = await fetchPage(fetchHistory(userId, now), skip);

  res.set("X-Has-More", hasMore ? "1" : "0");
  res.render("partials/_booking-cards", { reservations, muted: true });
};

exports.editForm = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  }).populate("vehicleId");

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (reservation.status !== "Pending") {
    req.flash("error", "Only pending requests can be edited. Contact an admin to change an approved booking.");
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

      const tightPrevious = await findTightPrecedingBooking(reservation.vehicleId._id, booking, {
        excludeReservationId: reservation._id,
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
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  });

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (reservation.status !== "Pending") {
    req.flash("error", "Only pending requests can be edited.");
    return res.redirect("/reservations/mine");
  }

  const booking = parseBookingWindow(
    req.body.date,
    req.body.startTime,
    req.body.endTime,
  );

  if (!booking) {
    req.flash("error", "Please choose a valid date and time.");
    return res.redirect(`/reservations/${reservation._id}/edit`);
  }

  const conflictExists = await Reservation.exists({
    _id: { $ne: reservation._id },
    vehicleId: reservation.vehicleId,
    status: { $in: ["Pending", "Reserved", "Active"] },
    requestedStartTime: { $lt: booking.end },
    requestedEndTime: { $gt: booking.start },
  });

  if (conflictExists) {
    req.flash("error", "That vehicle is already booked during that window.");
    return res.redirect(`/reservations/${reservation._id}/edit`);
  }

  if (req.body.confirmTightGap !== "true") {
    const tightPrevious = await findTightPrecedingBooking(reservation.vehicleId, booking, {
      excludeReservationId: reservation._id,
    });
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
      return res.redirect(`/reservations/${reservation._id}/edit?${qs.toString()}`);
    }
  }

  reservation.requestedStartTime = booking.start;
  reservation.requestedEndTime = booking.end;
  reservation.staffNotes = req.body.staffNotes || "";
  reservation.tripFoodRelated = req.body.tripFoodRelated;
  reservation.tripFoodRelatedDetail =
    req.body.tripFoodRelated === "Other" ? req.body.tripFoodRelatedDetail || "" : "";
  await reservation.save();

  req.flash("success", "Booking request updated.");
  res.redirect("/reservations/mine");
};

exports.cancelRequest = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  });

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
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  }).populate("vehicleId", "make model year licensePlate");

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Mileage can only be reported for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  res.render("reservations/mileage", {
    title: "Report Mileage",
    reservation,
    activeNav: "dashboard",
  });
};

exports.submitMileage = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  });

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "Mileage can only be reported for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  const { startMileage, endMileage, fuelLevelEndPercent, otherDutyNote } = req.body;

  if (startMileage !== "" && startMileage !== undefined) {
    reservation.tripLog.startMileage = Number(startMileage);
  }
  if (endMileage !== "" && endMileage !== undefined) {
    reservation.tripLog.endMileage = Number(endMileage);
  }
  if (fuelLevelEndPercent !== "" && fuelLevelEndPercent !== undefined) {
    reservation.tripLog.fuelLevelEndPercent = Number(fuelLevelEndPercent);
  }

  reservation.tripLog.preTripInspectionPassed = req.body.preTripInspectionPassed === "on";
  reservation.tripLog.droppedOffFood = req.body.droppedOffFood === "on";
  reservation.tripLog.pickedUpFood = req.body.pickedUpFood === "on";
  reservation.tripLog.otherDuty = req.body.otherDuty === "on";
  reservation.tripLog.otherDutyNote = (otherDutyNote || "").trim();
  reservation.tripLog.washed = req.body.washed === "on";

  await reservation.save();

  req.flash("success", "Mileage reported. Thanks!");
  res.redirect("/reservations/mine");
};

exports.issueForm = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  }).populate("vehicleId", "make model year licensePlate");

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
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  });

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
    return res.redirect(`/reservations/${reservation._id}/issue`);
  }

  await Vehicle.findByIdAndUpdate(reservation.vehicleId, {
    $push: {
      activeIssues: {
        description,
        reportedBy: res.locals.currentUser._id,
        reservationId: reservation._id,
        reviewed: false,
      },
    },
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
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  }).populate("vehicleId", "make model year licensePlate");

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
    groups: VEHICLE_INSPECTION_GROUPS,
    activeNav: "dashboard",
  });
};

exports.submitInspection = async (req, res) => {
  const reservation = await Reservation.findOne({
    _id: req.params.id,
    userId: res.locals.currentUser._id,
  }).populate("vehicleId", "make model year licensePlate");

  if (!reservation) {
    return renderError(res, 404, "Reservation not found.");
  }

  if (!REPORTABLE_STATUSES.includes(reservation.status)) {
    req.flash("error", "The vehicle can only be returned for a trip that has started.");
    return res.redirect("/reservations/mine");
  }

  const skipped = req.body.action === "skip";

  if (skipped) {
    reservation.vehicleInspection = { completedAt: new Date(), skipped: true };
  } else {
    const defects = (req.body.defects || []).filter((item) =>
      VEHICLE_INSPECTION_ITEMS.includes(item),
    );

    reservation.vehicleInspection = {
      completedAt: new Date(),
      skipped: false,
      conditionSatisfactory: req.body.conditionSatisfactory === "on",
      remarks: (req.body.remarks || "").trim(),
    };

    if (defects.length) {
      await Vehicle.findByIdAndUpdate(reservation.vehicleId._id, {
        $push: {
          activeIssues: {
            $each: defects.map((item) => ({
              description: `Vehicle inspection: ${item}`,
              reportedBy: res.locals.currentUser._id,
              reservationId: reservation._id,
              reviewed: false,
            })),
          },
        },
      });
    }
  }

  await reservation.save();

  res.render("reservations/return-confirmation", {
    title: "Vehicle Returned",
    reservation,
    skipped,
    activeNav: "dashboard",
  });
};

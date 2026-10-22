const { Vehicle } = require("../models");
const { parseBookingWindow } = require("../utils/availability");
const { staffTripSchema } = require("../validators/trip");
const { TripEntryError, recordManualTrip } = require("../services/manualTrip");

function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function renderForm(res, values, status = 200) {
  const vehicles = await Vehicle.findAll({
    attributes: ["id", "make", "model", "year", "licensePlate", "currentMileage"],
    order: [["make", "ASC"], ["model", "ASC"]],
  });
  res.status(status).render("trips/new", {
    title: "Log a Past Trip",
    mode: "staff",
    formAction: "/trips",
    vehicles,
    drivers: [],
    values,
    maxDate: todayIso(),
    activeNav: "dashboard",
  });
}

exports.newForm = async (req, res) => {
  await renderForm(res, { vehicleId: "", date: todayIso(), startTime: "", endTime: "" });
};

// A staff member records a trip they took without a booking. It's saved as
// Submitted — not counted anywhere yet — and appears for admins to approve
// (Completed) or deny (see controllers/admin/reservation.js).
exports.create = async (req, res) => {
  const fail = (message) => {
    res.locals.errorMessages = [message];
    return renderForm(res, req.body, 400);
  };

  const { error: invalid, value: values } = staffTripSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (invalid) {
    return fail(invalid.details.map((detail) => detail.message).join(" "));
  }

  const booking = parseBookingWindow(values.date, values.startTime, values.endTime);
  if (!booking) {
    return fail("The trip's end time must be after its start time.");
  }
  if (booking.end > new Date()) {
    return fail("Only trips that have already happened can be logged — the end time is in the future.");
  }

  const vehicle = await Vehicle.findByPk(values.vehicleId);
  if (!vehicle) {
    return fail("That vehicle could not be found.");
  }

  const currentUser = res.locals.currentUser;
  try {
    await recordManualTrip({
      vehicle,
      driver: currentUser,
      booking,
      values,
      loggedBy: currentUser,
      submitted: true,
      notes: values.staffNotes,
    });
  } catch (error) {
    if (error instanceof TripEntryError) {
      return fail(error.message);
    }
    throw error;
  }

  req.flash(
    "success",
    `Trip submitted for the ${vehicle.make} ${vehicle.model}. An admin will review it before it's added to the trip log.`,
  );
  res.redirect("/reservations/mine");
};

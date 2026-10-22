const { Vehicle, User } = require("../../models");
const { parseBookingWindow } = require("../../utils/availability");
const { manualTripSchema } = require("../../validators/trip");
const { TripEntryError, recordManualTrip } = require("../../services/manualTrip");

async function formOptions() {
  const [vehicles, drivers] = await Promise.all([
    Vehicle.findAll({
      attributes: ["id", "make", "model", "year", "licensePlate", "currentMileage"],
      order: [["make", "ASC"], ["model", "ASC"]],
    }),
    User.findAll({
      attributes: ["id", "firstName", "lastName", "email", "role"],
      where: { isActive: true, isApproved: true },
      order: [["firstName", "ASC"], ["lastName", "ASC"]],
    }),
  ]);
  return { vehicles, drivers };
}

function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function renderForm(res, values, status = 200) {
  res.status(status).render("trips/new", {
    title: "Log a Trip",
    mode: "admin",
    formAction: "/admin/trips",
    ...(await formOptions()),
    values,
    maxDate: todayIso(),
    activeNav: "admin-log-trip",
  });
}

exports.newForm = async (req, res) => {
  await renderForm(res, {
    vehicleId: typeof req.query.vehicleId === "string" ? req.query.vehicleId : "",
    userId: "",
    date: todayIso(),
    startTime: "",
    endTime: "",
  });
};

// Records a trip that happened without a booking for any driver. Stored as
// an ordinary Completed reservation so it appears in the trip log, mileage
// log and trip-log email, and takes its place in the vehicle's odometer
// chain like any other trip (see services/manualTrip.js).
exports.create = async (req, res) => {
  // Validated here rather than with the validateBody middleware so a
  // mistake re-shows the form with everything the admin typed still filled
  // in, instead of redirecting to an empty one.
  const fail = (message) => {
    res.locals.errorMessages = [message];
    return renderForm(res, req.body, 400);
  };

  const { error: invalid, value: values } = manualTripSchema.validate(req.body, {
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

  const [vehicle, driver] = await Promise.all([
    Vehicle.findByPk(values.vehicleId),
    User.findOne({ where: { id: values.userId, isActive: true, isApproved: true } }),
  ]);
  if (!vehicle) {
    return fail("That vehicle could not be found.");
  }
  if (!driver) {
    return fail("That driver could not be found (or their account is deactivated).");
  }

  let reservation;
  try {
    reservation = await recordManualTrip({
      vehicle,
      driver,
      booking,
      values,
      loggedBy: res.locals.currentUser,
      submitted: false,
      notes: values.adminNotes,
    });
  } catch (error) {
    if (error instanceof TripEntryError) {
      return fail(error.message);
    }
    throw error;
  }

  req.flash(
    "success",
    `Trip logged: ${driver.firstName} ${driver.lastName} in the ${vehicle.make} ${vehicle.model}, ` +
      `${(values.endMileage - reservation.startMileage).toLocaleString()} mi.`,
  );
  res.redirect(`/admin/reservations/${reservation.id}`);
};

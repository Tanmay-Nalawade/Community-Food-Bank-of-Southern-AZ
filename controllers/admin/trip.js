const { Op } = require("sequelize");
const { Reservation, Vehicle, User } = require("../../models");
const { parseBookingWindow, withVehicleLock, formatBookingLabel } = require("../../utils/availability");
const { startReadingBefore, afterEndMileageSaved } = require("../../services/odometer");
const { manualTripSchema } = require("../../validators/admin/trip");

// Anything that means the vehicle was (or is going to be) out at that time.
const OCCUPYING_STATUSES = ["Pending", "Reserved", "Active", "Completed"];

// Rolls the withVehicleLock transaction back with a message for the admin.
class TripEntryError extends Error {}

async function formOptions() {
  const [vehicles, drivers] = await Promise.all([
    Vehicle.findAll({
      attributes: ["id", "make", "model", "year", "licensePlate", "currentMileage"],
      order: [["make", "ASC"], ["model", "ASC"]],
    }),
    User.findAll({
      attributes: ["id", "firstName", "lastName", "email", "role"],
      where: { isActive: true },
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
  res.status(status).render("admin/trips/new", {
    title: "Log a Trip",
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

// Records a trip that happened without a booking (someone took a vehicle
// without reserving it). Stored as an ordinary Completed reservation so it
// appears in the trip log, mileage log and trip-log email, and takes its
// place in the vehicle's odometer chain like any other trip.
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
    User.findOne({ where: { id: values.userId, isActive: true } }),
  ]);
  if (!vehicle) {
    return fail("That vehicle could not be found.");
  }
  if (!driver) {
    return fail("That driver could not be found (or their account is deactivated).");
  }

  let reservation;
  try {
    // Locked like a booking, so a trip can't be logged on top of a
    // reservation that's being created for the same vehicle at that moment.
    reservation = await withVehicleLock(vehicle.id, async ({ transaction }) => {
      const clash = await Reservation.findOne({
        where: {
          vehicleId: vehicle.id,
          status: { [Op.in]: OCCUPYING_STATUSES },
          requestedStartTime: { [Op.lt]: booking.end },
          requestedEndTime: { [Op.gt]: booking.start },
        },
        transaction,
      });
      if (clash) {
        throw new TripEntryError(
          `That vehicle already has a ${clash.isManualEntry ? "logged trip" : "booking"} overlapping this time ` +
            `(${formatBookingLabel({ start: clash.requestedStartTime, end: clash.requestedEndTime })}).`,
        );
      }

      const startMileage = await startReadingBefore(vehicle.id, booking.start, { transaction });
      if (startMileage != null && values.endMileage < startMileage) {
        throw new TripEntryError(
          `The end odometer can't be less than this trip's start reading (${startMileage.toLocaleString()} mi — ` +
            "the vehicle's reading after its previous trip).",
        );
      }

      return Reservation.create(
        {
          userId: driver.id,
          vehicleId: vehicle.id,
          requestedStartTime: booking.start,
          requestedEndTime: booking.end,
          tripStartedAt: booking.start,
          tripEndedAt: booking.end,
          status: "Completed",
          isManualEntry: true,
          reviewedById: res.locals.currentUser.id,
          reviewedAt: new Date(),
          startMileage,
          endMileage: values.endMileage,
          fuelLevelEndPercent: values.fuelLevelEndPercent ?? null,
          droppedOffFood: values.droppedOffFood === "on",
          pickedUpFood: values.pickedUpFood === "on",
          washed: values.washed === "on",
          tripFoodRelated: values.tripFoodRelated,
          tripFoodRelatedDetail: values.tripFoodRelated === "Other" ? values.tripFoodRelatedDetail || "" : "",
          adminNotes: values.adminNotes || "",
        },
        { transaction },
      );
    });
  } catch (error) {
    if (error instanceof TripEntryError) {
      return fail(error.message);
    }
    throw error;
  }

  await afterEndMileageSaved(reservation);

  req.flash(
    "success",
    `Trip logged: ${driver.firstName} ${driver.lastName} in the ${vehicle.make} ${vehicle.model}, ` +
      `${(values.endMileage - reservation.startMileage).toLocaleString()} mi.`,
  );
  res.redirect(`/admin/reservations/${reservation.id}`);
};

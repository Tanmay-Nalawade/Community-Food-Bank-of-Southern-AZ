const Reservation = require("../models/reservation");
const Vehicle = require("../models/vehicle");
const AccessLog = require("../models/accessLog");

const HANDLED_EVENT_TYPES = ["PICKUP", "DROPOFF"];

exports.handleKeyCafeEvent = async (req, res) => {
  const { type, access } = req.body || {};

  if (!access?.id || !HANDLED_EVENT_TYPES.includes(type)) {
    return res.status(200).send("Ignored");
  }

  const reservation = await Reservation.findOne({
    "keyCafeAccess.accessId": String(access.id),
  });

  if (!reservation) {
    console.warn(`KeyCafe webhook: no reservation found for access ${access.id}`);
    return res.status(200).send("No matching reservation");
  }

  const occurredAt = req.body.dateCreated ? new Date(req.body.dateCreated) : new Date();

  if (type === "PICKUP" && reservation.status === "Reserved") {
    reservation.keyCafeAccess.keyPickedUpAt = occurredAt;
    reservation.tripLog.tripStartedAt = occurredAt;
    reservation.status = "Active";
    await reservation.save();
    await Vehicle.findByIdAndUpdate(reservation.vehicleId, { status: "In Use" });
    await AccessLog.create({
      reservationId: reservation._id,
      vehicleId: reservation.vehicleId,
      userId: reservation.userId,
      action: "PickedUp",
      accessId: String(access.id),
      bookingCode: reservation.keyCafeAccess.bookingCode,
    });
  } else if (type === "DROPOFF" && reservation.status === "Active") {
    reservation.keyCafeAccess.keyReturnedAt = occurredAt;
    reservation.tripLog.tripEndedAt = occurredAt;
    reservation.status = "Completed";
    await reservation.save();
    await Vehicle.findByIdAndUpdate(reservation.vehicleId, { status: "Available" });
    await AccessLog.create({
      reservationId: reservation._id,
      vehicleId: reservation.vehicleId,
      userId: reservation.userId,
      action: "Returned",
      accessId: String(access.id),
      bookingCode: reservation.keyCafeAccess.bookingCode,
    });
  }

  res.status(200).send("OK");
};

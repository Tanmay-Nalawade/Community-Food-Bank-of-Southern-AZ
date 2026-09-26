const { Reservation, Vehicle, AccessLog } = require("../models");
const { fillStartMileage } = require("../services/odometer");

const HANDLED_EVENT_TYPES = ["PICKUP", "DROPOFF"];

exports.handleKeyCafeEvent = async (req, res) => {
  const { type, access } = req.body || {};

  if (!access?.id || !HANDLED_EVENT_TYPES.includes(type)) {
    return res.status(200).send("Ignored");
  }

  const reservation = await Reservation.findOne({
    where: { keyCafeAccessId: String(access.id) },
  });

  if (!reservation) {
    console.warn(`KeyCafe webhook: no reservation found for access ${access.id}`);
    return res.status(200).send("No matching reservation");
  }

  const occurredAt = req.body.dateCreated ? new Date(req.body.dateCreated) : new Date();

  if (type === "PICKUP" && reservation.status === "Reserved") {
    reservation.keyPickedUpAt = occurredAt;
    reservation.tripStartedAt = occurredAt;
    reservation.status = "Active";
    await fillStartMileage(reservation);
    await reservation.save();
    await Vehicle.update({ status: "In Use" }, { where: { id: reservation.vehicleId } });
    await AccessLog.create({
      reservationId: reservation.id,
      vehicleId: reservation.vehicleId,
      userId: reservation.userId,
      action: "PickedUp",
      accessId: String(access.id),
      bookingCode: reservation.keyCafeBookingCode,
    });
  } else if (type === "DROPOFF" && reservation.status === "Active") {
    reservation.keyReturnedAt = occurredAt;
    reservation.tripEndedAt = occurredAt;
    reservation.status = "Completed";
    await reservation.save();
    await Vehicle.update({ status: "Available" }, { where: { id: reservation.vehicleId } });
    await AccessLog.create({
      reservationId: reservation.id,
      vehicleId: reservation.vehicleId,
      userId: reservation.userId,
      action: "Returned",
      accessId: String(access.id),
      bookingCode: reservation.keyCafeBookingCode,
    });
  }

  res.status(200).send("OK");
};
